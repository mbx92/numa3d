import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'
import { uploadImage, removeImageQuietly } from '../../../utils/image.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.productSeries).where(eq(schema.productSeries.id, id))
  if (!existing.length) throw createError({ statusCode: 404, statusMessage: 'Series tidak ditemukan' })

  const { objectKey } = await uploadImage(event, `series/${id}/images`)
  await removeImageQuietly(existing[0].imageKey)

  const rows = await db
    .update(schema.productSeries)
    .set({ imageKey: objectKey })
    .where(eq(schema.productSeries.id, id))
    .returning()
  await logAudit(event, { action: 'update', entity: 'product_series', entityId: id, summary: `Ubah sampul series "${rows[0].name}"` })
  return rows[0]
})
