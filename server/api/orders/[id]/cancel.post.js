import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { logAudit } from '../../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const order = await useDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id))
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Order tidak ditemukan' })
    if (existing.status === 'completed') {
      throw createError({ statusCode: 400, statusMessage: 'Order selesai tidak bisa dibatalkan' })
    }
    const [item] = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id))
    const jobs = item
      ? await tx.select().from(schema.productions).where(eq(schema.productions.orderItemId, item.id))
      : []
    if (jobs.some((job) => job.status === 'in_progress')) {
      throw createError({ statusCode: 400, statusMessage: 'Hentikan produksi yang sedang berjalan sebelum membatalkan order' })
    }
    for (const job of jobs.filter((entry) => entry.status === 'queued')) {
      await tx.update(schema.productions).set({ status: 'cancelled' }).where(eq(schema.productions.id, job.id))
    }
    if (item) {
      await tx.update(schema.orderItems).set({ quantityReserved: 0 }).where(eq(schema.orderItems.id, item.id))
    }
    const [updated] = await tx.update(schema.orders).set({ status: 'cancelled' }).where(eq(schema.orders.id, id)).returning()
    return updated
  })
  await logAudit(event, { action: 'update', entity: 'order', entityId: id, summary: `Batalkan order #${id}` })
  return order
})
