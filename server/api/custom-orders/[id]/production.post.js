import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { logAudit } from '../../../utils/audit.js'
import { productionValuesFromOrder } from '../../../utils/customOrders.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.customOrders).where(eq(schema.customOrders.id, id))
    if (!order) throw createError({ statusCode: 404, statusMessage: 'Pesanan custom tidak ditemukan' })
    if (order.status === 'delivered' || order.status === 'cancelled') {
      throw createError({ statusCode: 400, statusMessage: 'Pesanan ini tidak bisa diproduksi ulang' })
    }
    const [existing] = await tx.select().from(schema.productions).where(eq(schema.productions.customOrderId, id))
    if (existing) {
      throw createError({ statusCode: 400, statusMessage: 'Produksi untuk pesanan ini sudah ada' })
    }
    const [created] = await tx
      .insert(schema.productions)
      .values(productionValuesFromOrder(order, { status: 'queued' }))
      .returning()
    return created
  })
  await logAudit(event, {
    action: 'create',
    entity: 'production',
    entityId: row.id,
    summary: `Buat ulang produksi custom order id ${id}`
  })
  return row
})
