import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'
import { uploadImage, removeImageQuietly } from '../../../utils/image.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.packaging).where(eq(schema.packaging.id, id))
  if (!existing.length) throw createError({ statusCode: 404, statusMessage: 'Packaging tidak ditemukan' })

  const { objectKey } = await uploadImage(event, `packaging/${id}`)
  await removeImageQuietly(existing[0].imageKey)

  const rows = await db
    .update(schema.packaging)
    .set({ imageKey: objectKey })
    .where(eq(schema.packaging.id, id))
    .returning()
  await logAudit(event, { action: 'update', entity: 'packaging', entityId: id, summary: `Ubah gambar packaging "${rows[0].name}"` })
  return rows[0]
})
