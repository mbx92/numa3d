import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import {
  applyProductionCompletion,
  parseProductionBody,
  reverseProductionCompletion,
  stampProductionTiming
} from '../../utils/productionStock.js'
import { syncOrderStatus } from '../../utils/orders.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const parsed = parseProductionBody(body)
  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.productions).where(eq(schema.productions.id, id))
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Produksi tidak ditemukan' })
    if (existing.orderItemId) {
      const [linkedOrder] = await tx
        .select({ status: schema.orders.status })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .where(eq(schema.orderItems.id, existing.orderItemId))
      if (linkedOrder?.status === 'completed' || linkedOrder?.status === 'cancelled') {
        throw createError({ statusCode: 400, statusMessage: 'Produksi dari order selesai atau batal tidak bisa diubah' })
      }
    }
    if (existing.customOrderId) {
      parsed.customOrderId = existing.customOrderId
      parsed.productId = null
    } else if (existing.orderItemId) {
      parsed.customOrderId = null
      parsed.productId = existing.productId
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
    if (updated.orderItemId) await syncOrderStatus(tx, schema, updated.orderItemId)
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
