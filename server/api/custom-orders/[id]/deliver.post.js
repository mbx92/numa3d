import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { logAudit } from '../../../utils/audit.js'
import { allocateInvoiceNumber } from '../../../utils/invoice.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.customOrders).where(eq(schema.customOrders.id, id))
    if (!order) throw createError({ statusCode: 404, statusMessage: 'Pesanan custom tidak ditemukan' })
    if (order.status === 'delivered') {
      throw createError({ statusCode: 400, statusMessage: 'Pesanan ini sudah diserahkan' })
    }
    const [job] = await tx.select().from(schema.productions).where(eq(schema.productions.customOrderId, id))
    if (!job || job.status !== 'done' || job.quantityGood < 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Selesaikan produksi dan pastikan ada unit jadi sebelum menyerahkan'
      })
    }
    const [existingSale] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.customOrderId, id))
    if (existingSale) {
      throw createError({ statusCode: 400, statusMessage: 'Penjualan untuk pesanan ini sudah tercatat' })
    }
    const qty = job.quantityGood
    const price =
      body.salePricePerUnit != null && body.salePricePerUnit !== ''
        ? Math.max(Math.round(Number(body.salePricePerUnit) || 0), 0)
        : order.pricePerUnit
    const invoiceNumber = await allocateInvoiceNumber(tx, schema, body.date || order.date)
    const [sale] = await tx
      .insert(schema.sales)
      .values({
        date: body.date || order.date,
        productId: null,
        customOrderId: id,
        quantity: qty,
        salePricePerUnit: price,
        channel: order.channel,
        marketplaceFeePercent:
          body.marketplaceFeePercent !== null && body.marketplaceFeePercent !== undefined && body.marketplaceFeePercent !== ''
            ? Number(body.marketplaceFeePercent)
            : null,
        notes: body.notes || `Custom · ${order.customerName} · ${order.title}`,
        customerName: order.customerName,
        invoiceNumber
      })
      .returning()
    await tx.update(schema.customOrders).set({ status: 'delivered' }).where(eq(schema.customOrders.id, id))
    return sale
  })
  await logAudit(event, {
    action: 'create',
    entity: 'sale',
    entityId: row.id,
    summary: `Serah terima custom order id ${id}`
  })
  return row
})
