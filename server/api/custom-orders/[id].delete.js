import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { reverseProductionCompletion } from '../../utils/productionStock.js'
import { useMinio, minioBucket } from '../../utils/minio.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.customOrders).where(eq(schema.customOrders.id, id))
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Pesanan custom tidak ditemukan' })
    if (existing.status === 'delivered') {
      throw createError({ statusCode: 400, statusMessage: 'Pesanan yang sudah diserahkan tidak bisa dihapus' })
    }
    const [sale] = await tx.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.customOrderId, id))
    if (sale) {
      throw createError({ statusCode: 400, statusMessage: 'Hapus penjualan terkait dulu sebelum menghapus pesanan' })
    }
    const [job] = await tx.select().from(schema.productions).where(eq(schema.productions.customOrderId, id))
    if (job?.stockApplied) await reverseProductionCompletion(tx, schema, job)
    const files = await tx.select().from(schema.customOrderFiles).where(eq(schema.customOrderFiles.customOrderId, id))
    for (const f of files) {
      try {
        await useMinio().removeObject(minioBucket(), f.objectKey)
      } catch {
        /* file mungkin sudah tidak ada di bucket */
      }
    }
    await tx.delete(schema.customOrders).where(eq(schema.customOrders.id, id))
  })
  await logAudit(event, { action: 'delete', entity: 'custom_order', entityId: id, summary: `Hapus pesanan custom id ${id}` })
  return { ok: true }
})
