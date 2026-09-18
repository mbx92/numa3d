import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { reverseProductionCompletion } from '../../utils/productionStock.js'
import { syncOrderStatus } from '../../utils/orders.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.productions).where(eq(schema.productions.id, id))
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Produksi tidak ditemukan' })
    if (existing.customOrderId) {
      const [order] = await tx
        .select({ status: schema.customOrders.status })
        .from(schema.customOrders)
        .where(eq(schema.customOrders.id, existing.customOrderId))
      if (order?.status === 'delivered') {
        throw createError({ statusCode: 400, statusMessage: 'Produksi custom yang sudah diserahkan tidak bisa dihapus' })
      }
    }
    if (existing.orderItemId) {
      const [linkedOrder] = await tx
        .select({ status: schema.orders.status })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .where(eq(schema.orderItems.id, existing.orderItemId))
      if (linkedOrder?.status === 'completed') {
        throw createError({ statusCode: 400, statusMessage: 'Produksi dari order yang sudah diserahkan tidak bisa dihapus' })
      }
    }
    if (existing.stockApplied) await reverseProductionCompletion(tx, schema, existing)
    await tx.delete(schema.productions).where(eq(schema.productions.id, id))
    if (existing.orderItemId) await syncOrderStatus(tx, schema, existing.orderItemId)
  })
  await logAudit(event, { action: 'delete', entity: 'production', entityId: id, summary: `Hapus produksi id ${id}` })
  return { ok: true }
})
