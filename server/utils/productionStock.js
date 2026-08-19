import { eq, sql } from 'drizzle-orm'

function ints(job) {
  const good = Math.max(Math.round(Number(job.quantityGood) || 0), 0)
  const failed = Math.max(Math.round(Number(job.quantityFailed) || 0), 0)
  return {
    good,
    failed,
    printed: good + failed,
    productId: job.productId ? Number(job.productId) : null,
    customOrderId: job.customOrderId ? Number(job.customOrderId) : null
  }
}

async function bumpStock(tx, table, id, delta) {
  if (!id || !delta) return
  const [row] = await tx
    .update(table)
    .set({ stockQuantity: sql`${table.stockQuantity} + ${delta}` })
    .where(eq(table.id, id))
    .returning({ id: table.id })
  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'Data stok tidak ditemukan' })
  }
}

export async function printMinutesPerUnitForProduct(tx, schema, productId) {
  const rows = await tx
    .select({ printTimeMinutes: schema.productRecipes.printTimeMinutes })
    .from(schema.productRecipes)
    .where(eq(schema.productRecipes.productId, Number(productId)))
  if (!rows.length) return 0
  return rows.reduce((max, r) => Math.max(max, r.printTimeMinutes || 0), 0)
}

export async function stampProductionTiming(tx, schema, values, existing = null) {
  const next = { ...values }
  const active = next.status === 'in_progress' || next.status === 'done'
  if (!active) {
    next.startedAt = existing?.startedAt || null
    next.durationMinutes = existing?.durationMinutes ?? next.durationMinutes ?? 0
    return next
  }
  next.startedAt = existing?.startedAt || new Date()
  const plannedChanged = existing && existing.quantityPlanned !== next.quantityPlanned
  const productChanged = existing && existing.productId !== next.productId
  const customChanged = existing && existing.customOrderId !== next.customOrderId
  if (next.customOrderId) {
    const [order] = await tx
      .select({ printTimeMinutes: schema.customOrders.printTimeMinutes })
      .from(schema.customOrders)
      .where(eq(schema.customOrders.id, next.customOrderId))
    const perUnit = order?.printTimeMinutes || 0
    if (!existing?.durationMinutes || plannedChanged || customChanged) {
      next.durationMinutes = perUnit * next.quantityPlanned
    } else {
      next.durationMinutes = existing.durationMinutes
    }
    return next
  }
  if (!existing?.durationMinutes || plannedChanged || productChanged) {
    const perUnit = await printMinutesPerUnitForProduct(tx, schema, next.productId)
    next.durationMinutes = perUnit * next.quantityPlanned
  } else {
    next.durationMinutes = existing.durationMinutes
  }
  return next
}

async function applyCustomCompletion(tx, schema, job, sign) {
  const { good, printed, customOrderId } = ints(job)
  const [order] = await tx.select().from(schema.customOrders).where(eq(schema.customOrders.id, customOrderId))
  if (!order) {
    throw createError({ statusCode: 400, statusMessage: 'Pesanan custom tidak ditemukan' })
  }
  const matQty = (Number(order.materialQuantityUsed) || 0) * printed * sign
  await bumpStock(tx, schema.materials, order.materialId, -matQty)
  const packQty = (Number(order.packagingQuantityUsed) || 0) * good * sign
  if (order.packagingId) await bumpStock(tx, schema.packaging, order.packagingId, -packQty)
  if (order.status !== 'delivered' && order.status !== 'cancelled') {
    await tx
      .update(schema.customOrders)
      .set({ status: sign > 0 && good > 0 ? 'ready' : 'open' })
      .where(eq(schema.customOrders.id, customOrderId))
  }
}

export async function applyProductionCompletion(tx, schema, job) {
  const { good, printed, productId, customOrderId } = ints(job)
  if (customOrderId) {
    await applyCustomCompletion(tx, schema, job, 1)
    return
  }
  if (!productId) {
    throw createError({ statusCode: 400, statusMessage: 'Produk tidak valid' })
  }
  if (good > 0) {
    const [product] = await tx
      .update(schema.products)
      .set({ stockQuantity: sql`${schema.products.stockQuantity} + ${good}` })
      .where(eq(schema.products.id, productId))
      .returning({ id: schema.products.id })
    if (!product) {
      throw createError({ statusCode: 400, statusMessage: 'Produk tidak ditemukan, stok tidak diubah' })
    }
  }

  const recipes = await tx
    .select()
    .from(schema.productRecipes)
    .where(eq(schema.productRecipes.productId, productId))
  for (const r of recipes) {
    const qty = (Number(r.quantityUsed) || 0) * printed
    if (!qty || !r.materialId) continue
    await bumpStock(tx, schema.materials, r.materialId, -qty)
  }

  const packs = await tx
    .select()
    .from(schema.productPackaging)
    .where(eq(schema.productPackaging.productId, productId))
  for (const p of packs) {
    const qty = (Number(p.quantityUsed) || 0) * good
    if (!qty || !p.packagingId) continue
    await bumpStock(tx, schema.packaging, p.packagingId, -qty)
  }
}

export async function reverseProductionCompletion(tx, schema, job) {
  const { good, printed, productId, customOrderId } = ints(job)
  if (customOrderId) {
    await applyCustomCompletion(tx, schema, job, -1)
    return
  }
  if (good > 0 && productId) {
    await tx
      .update(schema.products)
      .set({ stockQuantity: sql`${schema.products.stockQuantity} - ${good}` })
      .where(eq(schema.products.id, productId))
  }

  const recipes = await tx
    .select()
    .from(schema.productRecipes)
    .where(eq(schema.productRecipes.productId, productId))
  for (const r of recipes) {
    const qty = (Number(r.quantityUsed) || 0) * printed
    if (!qty || !r.materialId) continue
    await bumpStock(tx, schema.materials, r.materialId, qty)
  }

  const packs = await tx
    .select()
    .from(schema.productPackaging)
    .where(eq(schema.productPackaging.productId, productId))
  for (const p of packs) {
    const qty = (Number(p.quantityUsed) || 0) * good
    if (!qty || !p.packagingId) continue
    await bumpStock(tx, schema.packaging, p.packagingId, qty)
  }
}

export function parseProductionBody(body) {
  const statuses = ['queued', 'in_progress', 'done', 'cancelled']
  const productId = body.productId ? Number(body.productId) : null
  const customOrderId = body.customOrderId ? Number(body.customOrderId) : null
  if (!body.date) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal wajib diisi' })
  }
  if (!productId && !customOrderId) {
    throw createError({ statusCode: 400, statusMessage: 'Produk atau pesanan custom wajib diisi' })
  }
  if (productId && customOrderId) {
    throw createError({ statusCode: 400, statusMessage: 'Produksi katalog dan custom tidak bisa digabung' })
  }
  const status = statuses.includes(body.status) ? body.status : 'queued'
  const planned = Math.max(Math.round(Number(body.quantityPlanned) || 1), 1)
  const good = Math.max(Math.round(Number(body.quantityGood) || 0), 0)
  const failed = Math.max(Math.round(Number(body.quantityFailed) || 0), 0)
  if (status === 'done' && good + failed <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Isi jumlah jadi atau gagal sebelum menandai produksi selesai'
    })
  }
  const machineId = body.machineId ? Number(body.machineId) : null
  return {
    date: body.date,
    productId,
    customOrderId,
    machineId: Number.isInteger(machineId) && machineId > 0 ? machineId : null,
    quantityPlanned: planned,
    quantityGood: good,
    quantityFailed: failed,
    status,
    notes: body.notes || null,
    stockApplied: status === 'done'
  }
}
