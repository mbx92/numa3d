import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { logAudit } from '../../../utils/audit.js'
import { allocateInvoiceNumber } from '../../../utils/invoice.js'
import { availableProductStock } from '../../../utils/orders.js'
import { parseSalePayment } from '../../../utils/salePayment.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = (await readBody(event).catch(() => null)) || {}
  const db = useDb()
  const sale = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ order: schema.orders, item: schema.orderItems })
      .from(schema.orders)
      .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
      .where(eq(schema.orders.id, id))
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Order tidak ditemukan' })
    if (row.order.status !== 'ready') {
      throw createError({ statusCode: 400, statusMessage: 'Order belum siap diserahkan' })
    }
    const [existingSale] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.orderId, id))
    if (existingSale) throw createError({ statusCode: 400, statusMessage: 'Penjualan order ini sudah tercatat' })

    const stock = await availableProductStock(tx, schema, row.item.productId, id)
    if (stock.stock < row.item.quantity) {
      throw createError({ statusCode: 400, statusMessage: `Stok fisik tidak cukup. Tersedia ${stock.stock} unit.` })
    }
    const saleDate = body.date || row.order.date
    const payment = parseSalePayment(body, row.order.channel, saleDate)
    const invoiceNumber = await allocateInvoiceNumber(tx, schema, saleDate)
    const [created] = await tx.insert(schema.sales).values({
      date: saleDate,
      productId: row.item.productId,
      customOrderId: null,
      orderId: id,
      quantity: row.item.quantity,
      salePricePerUnit: row.item.pricePerUnit,
      hppPerUnit: row.item.hppPerUnit,
      channel: row.order.channel,
      notes: row.order.notes || `Order #${id}`,
      customerName: row.order.customerName,
      invoiceNumber,
      ...payment
    }).returning()
    await tx
      .update(schema.products)
      .set({ stockQuantity: sql`${schema.products.stockQuantity} - ${row.item.quantity}` })
      .where(eq(schema.products.id, row.item.productId))
    await tx.update(schema.orders).set({ status: 'completed' }).where(eq(schema.orders.id, id))
    return created
  })
  await logAudit(event, { action: 'create', entity: 'sale', entityId: sale.id, summary: `Serahkan order #${id}` })
  return sale
})
