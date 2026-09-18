import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { parseCustomOrderBody, productionValuesFromOrder } from '../../utils/customOrders.js'
import { loadCustomOrderSlice, copyCustomOrderModel, cleanupCustomOrderModel, saveCustomOrderMaterials } from '../../utils/customOrderSlicing.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const values = parseCustomOrderBody(body)
  const db = useDb()
  let copiedKey, row
  try {
    row = await db.transaction(async (tx) => {
      const slice = await loadCustomOrderSlice(tx, body.slicerJobId, values.materialId, event.context.auth, values.quantity)
      const [created] = await tx.insert(schema.customOrders).values({ ...values, ...slice.values }).returning()
      await saveCustomOrderMaterials(tx, created.id, slice.materialUsage)
      await copyCustomOrderModel(tx, created.id, slice.job, (key) => { copiedKey = key })
      await tx.insert(schema.productions).values(productionValuesFromOrder(created, { status: 'queued' }))
      return created
    })
  } catch (error) {
    await cleanupCustomOrderModel(copiedKey)
    throw error
  }
  await logAudit(event, {
    action: 'create',
    entity: 'custom_order',
    entityId: row.id,
    summary: `Pesanan custom "${row.title}" untuk ${row.customerName}`
  })
  return row
})
