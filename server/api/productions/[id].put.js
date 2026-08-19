import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import {
  applyProductionCompletion,
  parseProductionBody,
  reverseProductionCompletion,
  stampProductionTiming
} from '../../utils/productionStock.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const parsed = parseProductionBody(body)
  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.productions).where(eq(schema.productions.id, id))
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Produksi tidak ditemukan' })
    if (existing.customOrderId) {
      parsed.customOrderId = existing.customOrderId
      parsed.productId = null
    } else {
      parsed.customOrderId = null
      if (!parsed.productId) parsed.productId = existing.productId
    }
    if (existing.stockApplied) await reverseProductionCompletion(tx, schema, existing)
    const values = await stampProductionTiming(tx, schema, parsed, existing)
    const [updated] = await tx
      .update(schema.productions)
      .set(values)
      .where(eq(schema.productions.id, id))
      .returning()
    if (updated.stockApplied) await applyProductionCompletion(tx, schema, updated)
    return updated
  })
  await logAudit(event, {
    action: 'update',
    entity: 'production',
    entityId: id,
    summary: `Ubah produksi ${row.status} produk id ${row.productId}`
  })
  return row
})
