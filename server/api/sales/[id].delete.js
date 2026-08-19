import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.sales).where(eq(schema.sales.id, id))
    if (existing?.productId) {
      await tx
        .update(schema.products)
        .set({ stockQuantity: sql`${schema.products.stockQuantity} + ${existing.quantity}` })
        .where(eq(schema.products.id, existing.productId))
    }
    if (existing?.customOrderId) {
      await tx
        .update(schema.customOrders)
        .set({ status: 'ready' })
        .where(eq(schema.customOrders.id, existing.customOrderId))
    }
    await tx.delete(schema.sales).where(eq(schema.sales.id, id))
  })
  await logAudit(event, { action: 'delete', entity: 'sale', entityId: id, summary: `Hapus penjualan id ${id}` })
  return { ok: true }
})
