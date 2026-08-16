import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'
import { removeImageQuietly } from '../../../utils/image.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.packaging).where(eq(schema.packaging.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Packaging tidak ditemukan' })

  await removeImageQuietly(rows[0].imageKey)
  await db.update(schema.packaging).set({ imageKey: null }).where(eq(schema.packaging.id, id))
  await logAudit(event, { action: 'update', entity: 'packaging', entityId: id, summary: `Hapus gambar packaging "${rows[0].name}"` })
  return { ok: true }
})
