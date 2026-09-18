import { and, eq, inArray, sql } from 'drizzle-orm'

export const ACTIVE_ORDER_STATUSES = ['confirmed', 'in_production', 'ready']

export function deriveOrderStatus({ quantity, quantityReserved, jobs = [] }) {
  if (jobs.some((job) => job.status === 'in_progress')) return 'in_production'
  if (jobs.some((job) => job.status === 'queued')) return 'confirmed'
  return Number(quantityReserved) >= Number(quantity) ? 'ready' : 'confirmed'
}

export function parseOrderBody(body) {
  const customerName = String(body?.customerName || '').trim()
  const productId = Number(body?.productId)
  if (!body?.date || !customerName || !Number.isSafeInteger(productId) || productId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal, pelanggan, dan produk wajib diisi' })
  }
  return {
    order: {
      date: body.date,
      customerName,
      channel: ['tokopedia', 'shopee', 'tiktok_shop', 'instagram', 'whatsapp', 'direct', 'other'].includes(body.channel)
        ? body.channel
        : 'direct',
      notes: String(body.notes || '').trim() || null
    },
    item: {
      productId,
      quantity: Math.max(Math.round(Number(body.quantity) || 1), 1),
      pricePerUnit: Math.max(Math.round(Number(body.pricePerUnit) || 0), 0)
    }
  }
}

export async function lockProductOrders(tx, productId) {
  await tx.execute(sql`select pg_advisory_xact_lock(7351, ${Number(productId)})`)
}

export async function reservedProductQuantity(tx, schema, productId, excludeOrderId = null) {
  const rows = await tx
    .select({
      orderId: schema.orders.id,
      quantityReserved: schema.orderItems.quantityReserved
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(
      eq(schema.orderItems.productId, Number(productId)),
      inArray(schema.orders.status, ACTIVE_ORDER_STATUSES)
    ))
  return rows
    .filter((row) => row.orderId !== excludeOrderId)
    .reduce((total, row) => total + Math.max(Number(row.quantityReserved) || 0, 0), 0)
}

export async function availableProductStock(tx, schema, productId, excludeOrderId = null) {
  await lockProductOrders(tx, productId)
  const [product] = await tx
    .select({ id: schema.products.id, stockQuantity: schema.products.stockQuantity })
    .from(schema.products)
    .where(eq(schema.products.id, Number(productId)))
  if (!product) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
  const reserved = await reservedProductQuantity(tx, schema, productId, excludeOrderId)
  return {
    stock: Math.max(Number(product.stockQuantity) || 0, 0),
    reserved,
    available: Math.max((Number(product.stockQuantity) || 0) - reserved, 0)
  }
}

async function getOrderAndItem(tx, schema, orderId) {
  const [row] = await tx
    .select({ order: schema.orders, item: schema.orderItems, product: schema.products })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
    .where(eq(schema.orders.id, Number(orderId)))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Order tidak ditemukan' })
  return row
}

export async function syncOrderStatus(tx, schema, orderItemId) {
  if (!orderItemId) return null
  const [row] = await tx
    .select({ order: schema.orders, item: schema.orderItems })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(eq(schema.orderItems.id, Number(orderItemId)))
  if (!row || ['draft', 'completed', 'cancelled'].includes(row.order.status)) return row?.order || null

  const jobs = await tx
    .select({ status: schema.productions.status })
    .from(schema.productions)
    .where(eq(schema.productions.orderItemId, Number(orderItemId)))
  const status = deriveOrderStatus({
    quantity: row.item.quantity,
    quantityReserved: row.item.quantityReserved,
    jobs
  })

  const [updated] = await tx
    .update(schema.orders)
    .set({ status })
    .where(eq(schema.orders.id, row.order.id))
    .returning()
  return updated
}

export async function adjustOrderReservation(tx, schema, orderItemId, delta) {
  if (!orderItemId || !delta) return
  if (delta > 0) {
    await tx
      .update(schema.orderItems)
      .set({
        quantityReserved: sql`least(${schema.orderItems.quantity}, ${schema.orderItems.quantityReserved} + ${delta})`
      })
      .where(eq(schema.orderItems.id, Number(orderItemId)))
  } else {
    await tx
      .update(schema.orderItems)
      .set({ quantityReserved: sql`greatest(0, ${schema.orderItems.quantityReserved} + ${delta})` })
      .where(eq(schema.orderItems.id, Number(orderItemId)))
  }
}

export async function queueOrderProduction(tx, schema, orderId, { reserveStock = false } = {}) {
  const row = await getOrderAndItem(tx, schema, orderId)
  if (['completed', 'cancelled'].includes(row.order.status)) {
    throw createError({ statusCode: 400, statusMessage: 'Order ini tidak bisa diproduksi' })
  }
  if (reserveStock && row.order.status !== 'draft') {
    throw createError({ statusCode: 400, statusMessage: 'Order sudah dikonfirmasi' })
  }

  await lockProductOrders(tx, row.item.productId)
  const [currentProduct] = await tx
    .select({ stockQuantity: schema.products.stockQuantity })
    .from(schema.products)
    .where(eq(schema.products.id, row.item.productId))
  let reserved = row.item.quantityReserved
  if (reserveStock) {
    const otherReserved = await reservedProductQuantity(tx, schema, row.item.productId, row.order.id)
    const available = Math.max((Number(currentProduct?.stockQuantity) || 0) - otherReserved, 0)
    reserved = Math.min(row.item.quantity, available)
    await tx
      .update(schema.orderItems)
      .set({ quantityReserved: reserved })
      .where(eq(schema.orderItems.id, row.item.id))
  }

  const jobs = await tx
    .select()
    .from(schema.productions)
    .where(eq(schema.productions.orderItemId, row.item.id))
  const activePlanned = jobs
    .filter((job) => job.status === 'queued' || job.status === 'in_progress')
    .reduce((total, job) => total + (Number(job.quantityPlanned) || 0), 0)
  const missing = Math.max(row.item.quantity - reserved - activePlanned, 0)

  let production = null
  if (missing > 0) {
    const recipes = await tx
      .select({ machineId: schema.productRecipes.machineId, printTimeMinutes: schema.productRecipes.printTimeMinutes })
      .from(schema.productRecipes)
      .where(eq(schema.productRecipes.productId, row.item.productId))
    const process = recipes.find((recipe) => recipe.machineId || recipe.printTimeMinutes) || recipes[0]
    const created = await tx
      .insert(schema.productions)
      .values({
        date: row.order.date,
        productId: row.item.productId,
        customOrderId: null,
        orderItemId: row.item.id,
        machineId: process?.machineId || null,
        quantityPlanned: missing,
        quantityGood: 0,
        quantityFailed: 0,
        status: 'queued',
        notes: `Order #${row.order.id} · ${row.order.customerName}`,
        stockApplied: false,
        durationMinutes: (process?.printTimeMinutes || 0) * missing
      })
      .returning()
    production = created[0] || null
  }

  const status = reserved >= row.item.quantity && !production ? 'ready' : 'confirmed'
  const [order] = await tx
    .update(schema.orders)
    .set({ status })
    .where(eq(schema.orders.id, row.order.id))
    .returning()
  return { order, production, reserved, shortage: missing }
}
