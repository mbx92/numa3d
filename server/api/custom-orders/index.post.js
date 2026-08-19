import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { parseCustomOrderBody, productionValuesFromOrder } from '../../utils/customOrders.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const values = parseCustomOrderBody(body)
  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.customOrders).values(values).returning()
    await tx.insert(schema.productions).values(productionValuesFromOrder(created, { status: 'queued' }))
    return created
  })
  await logAudit(event, {
    action: 'create',
    entity: 'custom_order',
    entityId: row.id,
    summary: `Pesanan custom "${row.title}" untuk ${row.customerName}`
  })
  return row
})
