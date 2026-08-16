import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'
import { requireAdmin } from '../../../../utils/rbac.js'
import { logAudit } from '../../../../utils/audit.js'

// Lepas produk dari series (series_id jadi null). Produk tidak dihapus.
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const seriesId = Number(getRouterParam(event, 'id'))
  const productId = Number(getRouterParam(event, 'productId'))
  const db = useDb()
  const rows = await db
    .update(schema.products)
    .set({ seriesId: null })
    .where(and(eq(schema.products.id, productId), eq(schema.products.seriesId, seriesId)))
    .returning({ id: schema.products.id, name: schema.products.name })
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ada di series ini' })
  await logAudit(event, {
    action: 'update',
    entity: 'product_series',
    entityId: seriesId,
    summary: `Lepas produk "${rows[0].name}" dari series`
  })
  return { ok: true }
})
