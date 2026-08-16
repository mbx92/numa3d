import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'
import { removeImageQuietly } from '../../../utils/image.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.productSeries).where(eq(schema.productSeries.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Series tidak ditemukan' })

  await removeImageQuietly(rows[0].imageKey)
  await db.update(schema.productSeries).set({ imageKey: null }).where(eq(schema.productSeries.id, id))
  await logAudit(event, { action: 'update', entity: 'product_series', entityId: id, summary: `Hapus sampul series "${rows[0].name}"` })
  return { ok: true }
})
