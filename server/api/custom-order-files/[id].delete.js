import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { useMinio, minioBucket } from '../../utils/minio.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.customOrderFiles).where(eq(schema.customOrderFiles.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'File tidak ditemukan' })

  await useMinio().removeObject(minioBucket(), rows[0].objectKey)
  await db.delete(schema.customOrderFiles).where(eq(schema.customOrderFiles.id, id))
  await logAudit(event, {
    action: 'delete',
    entity: 'custom_order_file',
    entityId: id,
    summary: `Hapus file custom "${rows[0].filename}"`
  })
  return { ok: true }
})
