import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import {
  applyProductionCompletion,
  parseProductionBody
} from '../../utils/productionStock.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const values = parseProductionBody(body)
  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.productions).values(values).returning()
    if (created.stockApplied) await applyProductionCompletion(tx, schema, created)
    return created
  })
  await logAudit(event, {
    action: 'create',
    entity: 'production',
    entityId: row.id,
    summary: `Produksi ${row.status} produk id ${row.productId} rencana ${row.quantityPlanned} jadi ${row.quantityGood}`
  })
  return row
})
