import { and, eq, ne } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { minioBucket, useMinio } from '../../../utils/minio.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { findSlicerJob } from '../../../utils/slicerQueue.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const db = useDb()
  const id = getRouterParam(event, 'id')
  const job = await findSlicerJob(db, id)
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job slicing tidak ditemukan' })
  if (job.status === 'processing') throw createError({ statusCode: 409, statusMessage: 'Job yang sedang diproses tidak dapat dihapus' })
  const [deleted] = await db.delete(schema.slicerJobs)
    .where(and(eq(schema.slicerJobs.id, job.id), ne(schema.slicerJobs.status, 'processing')))
    .returning({ objectKey: schema.slicerJobs.objectKey })
  if (!deleted) throw createError({ statusCode: 409, statusMessage: 'Job sedang diambil worker dan tidak dapat dihapus' })
  await useMinio().removeObject(minioBucket(), deleted.objectKey).catch(() => {})
  return { ok: true }
})
