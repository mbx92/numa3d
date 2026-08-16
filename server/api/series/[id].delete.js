import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { removeImageQuietly } from '../../utils/image.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.productSeries).where(eq(schema.productSeries.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Series tidak ditemukan' })

  // Produk di dalamnya dibiarkan (series_id diset null oleh FK onDelete set null).
  await removeImageQuietly(rows[0].imageKey)
  await db.delete(schema.productSeries).where(eq(schema.productSeries.id, id))
  await logAudit(event, { action: 'delete', entity: 'product_series', entityId: id, summary: `Hapus series "${rows[0].name}"` })
  return { ok: true }
})
