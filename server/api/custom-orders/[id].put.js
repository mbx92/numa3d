import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { parseCustomOrderBody } from '../../utils/customOrders.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const values = parseCustomOrderBody(body)
  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.customOrders).where(eq(schema.customOrders.id, id))
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Pesanan custom tidak ditemukan' })
    if (existing.status === 'delivered') {
      throw createError({ statusCode: 400, statusMessage: 'Pesanan yang sudah diserahkan tidak bisa diubah' })
    }
    const [updated] = await tx
      .update(schema.customOrders)
      .set(values)
      .where(eq(schema.customOrders.id, id))
      .returning()
    const [job] = await tx.select().from(schema.productions).where(eq(schema.productions.customOrderId, id))
    if (job && !job.stockApplied) {
      await tx
        .update(schema.productions)
        .set({
          date: updated.date,
          machineId: updated.machineId,
          quantityPlanned: updated.quantity,
          notes: updated.notes,
          durationMinutes: (updated.printTimeMinutes || 0) * updated.quantity
        })
        .where(eq(schema.productions.id, job.id))
    }
    return updated
  })
  await logAudit(event, {
    action: 'update',
    entity: 'custom_order',
    entityId: id,
    summary: `Ubah pesanan custom "${row.title}"`
  })
  return row
})
