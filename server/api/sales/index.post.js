import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { allocateInvoiceNumber } from '../../utils/invoice.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.date || !body.productId) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal dan produk wajib diisi' })
  }
  const qty = Math.max(Math.round(Number(body.quantity) || 1), 1)
  const productId = Number(body.productId)
  const customerName = String(body.customerName || '').trim() || null
  const db = useDb()
  const rows = await db.transaction(async (tx) => {
    const invoiceNumber = await allocateInvoiceNumber(tx, schema, body.date)
    const created = await tx
      .insert(schema.sales)
      .values({
        date: body.date,
        productId,
        customOrderId: null,
        quantity: qty,
        salePricePerUnit: Math.round(Number(body.salePricePerUnit) || 0),
        channel: body.channel || 'direct',
        marketplaceFeePercent:
          body.marketplaceFeePercent !== null && body.marketplaceFeePercent !== ''
            ? Number(body.marketplaceFeePercent)
            : null,
        notes: body.notes || null,
        customerName,
        invoiceNumber
      })
      .returning()
    await tx
      .update(schema.products)
      .set({ stockQuantity: sql`${schema.products.stockQuantity} - ${qty}` })
      .where(eq(schema.products.id, productId))
    return created
  })
  await logAudit(event, {
    action: 'create',
    entity: 'sale',
    entityId: rows[0].id,
    summary: `Catat penjualan produk id ${rows[0].productId} x${rows[0].quantity}`
  })
  return rows[0]
})
