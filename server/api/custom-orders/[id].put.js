import { desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { parseCustomOrderBody } from '../../utils/customOrders.js'
import { loadCustomOrderSlice, copyCustomOrderModel, cleanupCustomOrderModel, validateCustomOrderFilament, saveCustomOrderMaterials, loadCustomOrderMaterials, validateCustomOrderStock } from '../../utils/customOrderSlicing.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const values = parseCustomOrderBody(body)
  const db = useDb()
  let copiedKey, row
  try {
    row = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.customOrders).where(eq(schema.customOrders.id, id))
      if (!existing) throw createError({ statusCode: 404, statusMessage: 'Pesanan custom tidak ditemukan' })
      if (existing.status === 'delivered') {
        throw createError({ statusCode: 400, statusMessage: 'Pesanan yang sudah diserahkan tidak bisa diubah' })
      }
      if (body.slicerJobId) {
        const productions = await tx.select().from(schema.productions).where(eq(schema.productions.customOrderId, id))
        if (productions.some((job) => job.status === 'in_progress' || job.stockApplied)) {
          throw createError({ statusCode: 400, statusMessage: 'File model tidak bisa diganti setelah produksi dimulai' })
        }
        const slice = await loadCustomOrderSlice(tx, body.slicerJobId, values.materialId, event.context.auth, values.quantity)
        Object.assign(values, slice.values)
        await saveCustomOrderMaterials(tx, id, slice.materialUsage)
        await copyCustomOrderModel(tx, id, slice.job, (key) => { copiedKey = key })
      } else {
        // Commercial edits retain the recorded slice; clients cannot override its statistics.
        values.materialQuantityUsed = existing.materialQuantityUsed
        values.printTimeMinutes = existing.printTimeMinutes
        const usage = await loadCustomOrderMaterials(tx, id)
        if (usage.length) values.materialId = existing.materialId
        if (existing.slicerResult) await validateCustomOrderFilament(tx, values.materialId)
        if (values.quantity > existing.quantity) await validateCustomOrderStock(tx, usage.length ? usage : [{ materialId: values.materialId, quantityUsed: values.materialQuantityUsed }], values.quantity)
      }
      const [updated] = await tx
        .update(schema.customOrders)
        .set(values)
        .where(eq(schema.customOrders.id, id))
        .returning()
      const [job] = await tx.select().from(schema.productions).where(eq(schema.productions.customOrderId, id)).orderBy(desc(schema.productions.id))
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
  } catch (error) {
    await cleanupCustomOrderModel(copiedKey)
    throw error
  }
  await logAudit(event, {
    action: 'update',
    entity: 'custom_order',
    entityId: id,
    summary: `Ubah pesanan custom "${row.title}"`
  })
  return row
})
