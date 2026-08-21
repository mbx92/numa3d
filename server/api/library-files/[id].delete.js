import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { useMinio, minioBucket } from '../../utils/minio.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.libraryFiles).where(eq(schema.libraryFiles.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'File tidak ditemukan' })

  await useMinio().removeObject(minioBucket(), rows[0].objectKey)
  await db.delete(schema.libraryFiles).where(eq(schema.libraryFiles.id, id))
  await logAudit(event, {
    action: 'delete',
    entity: 'library_file',
    entityId: id,
    summary: `Hapus file 3D galeri "${rows[0].filename}"`
  })
  return { ok: true }
})
