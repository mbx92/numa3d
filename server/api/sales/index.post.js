import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.date || !body.productId) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal dan produk wajib diisi' })
  }
  const db = useDb()
  const rows = await db
    .insert(schema.sales)
    .values({
      date: body.date,
      productId: Number(body.productId),
      quantity: Math.max(Math.round(Number(body.quantity) || 1), 1),
      salePricePerUnit: Math.round(Number(body.salePricePerUnit) || 0),
      channel: body.channel || 'direct',
      marketplaceFeePercent:
        body.marketplaceFeePercent !== null && body.marketplaceFeePercent !== ''
          ? Number(body.marketplaceFeePercent)
          : null,
      notes: body.notes || null
    })
    .returning()
  await logAudit(event, {
    action: 'create',
    entity: 'sale',
    entityId: rows[0].id,
    summary: `Catat penjualan produk id ${rows[0].productId} x${rows[0].quantity}`
  })
  return rows[0]
})
