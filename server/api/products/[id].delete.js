import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.products).where(eq(schema.products.id, id))
  try {
    await db.delete(schema.products).where(eq(schema.products.id, id))
  } catch (e) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Produk punya data penjualan, tidak bisa dihapus. Set status discontinued saja.'
    })
  }
  await logAudit(event, { action: 'delete', entity: 'product', entityId: id, summary: `Hapus produk "${existing[0]?.name || id}"` })
  return { ok: true }
})
