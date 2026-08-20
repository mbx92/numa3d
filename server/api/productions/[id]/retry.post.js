import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { logAudit } from '../../../utils/audit.js'
import { stampProductionTiming, printMinutesPerUnitForProduct } from '../../../utils/productionStock.js'

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const created = await db.transaction(async (tx) => {
    const [job] = await tx.select().from(schema.productions).where(eq(schema.productions.id, id))
    if (!job) throw createError({ statusCode: 404, statusMessage: 'Produksi tidak ditemukan' })
    if (job.status !== 'done') {
      throw createError({ statusCode: 400, statusMessage: 'Hanya produksi selesai yang bisa diulang' })
    }
    const failed = Math.max(Math.round(Number(job.quantityFailed) || 0), 0)
    if (failed < 1) {
      throw createError({ statusCode: 400, statusMessage: 'Tidak ada unit gagal untuk diulang' })
    }
    const [already] = await tx
      .select({ id: schema.productions.id })
      .from(schema.productions)
      .where(eq(schema.productions.retryOfId, id))
      .limit(1)
    if (already) {
      throw createError({ statusCode: 400, statusMessage: 'Antrian ulang untuk job ini sudah ada' })
    }
    if (job.customOrderId) {
      const [order] = await tx
        .select({ status: schema.customOrders.status })
        .from(schema.customOrders)
        .where(eq(schema.customOrders.id, job.customOrderId))
      if (order?.status === 'delivered' || order?.status === 'cancelled') {
        throw createError({ statusCode: 400, statusMessage: 'Pesanan custom ini tidak bisa diproduksi ulang' })
      }
    }
    const note = [`Ulang ${failed} unit gagal dari produksi #${job.id}`, job.notes].filter(Boolean).join(' — ')
    const values = await stampProductionTiming(tx, schema, {
      date: todayLocal(),
      productId: job.productId,
      customOrderId: job.customOrderId,
      machineId: job.machineId,
      quantityPlanned: failed,
      quantityGood: 0,
      quantityFailed: 0,
      status: 'queued',
      notes: note,
      stockApplied: false,
      retryOfId: job.id
    })
    if (!values.durationMinutes) {
      if (job.customOrderId) {
        const [order] = await tx
          .select({ printTimeMinutes: schema.customOrders.printTimeMinutes })
          .from(schema.customOrders)
          .where(eq(schema.customOrders.id, job.customOrderId))
        values.durationMinutes = (order?.printTimeMinutes || 0) * failed
      } else {
        const perUnit = await printMinutesPerUnitForProduct(tx, schema, job.productId)
        values.durationMinutes = perUnit * failed
      }
    }
    const [row] = await tx.insert(schema.productions).values(values).returning()
    return row
  })
  await logAudit(event, {
    action: 'create',
    entity: 'production',
    entityId: created.id,
    summary: `Ulang ${created.quantityPlanned} unit gagal dari produksi id ${id}`
  })
  return created
})
