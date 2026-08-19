import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { reverseProductionCompletion } from '../../utils/productionStock.js'

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
    if (existing.stockApplied) await reverseProductionCompletion(tx, schema, existing)
    await tx.delete(schema.productions).where(eq(schema.productions.id, id))
  })
  await logAudit(event, { action: 'delete', entity: 'production', entityId: id, summary: `Hapus produksi id ${id}` })
  return { ok: true }
})
