import { sql } from 'drizzle-orm'
import { useMinio, minioBucket } from '../../utils/minio.js'
import { useDb, schema } from '../../db/index.js'

// Cek konektivitas MinIO (tanpa membuat bucket) + ringkasan file yang tersimpan.
// Kredensial MinIO sengaja tidak diikutsertakan di response.
export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const started = Date.now()
  let reachable = false
  let bucketExists = false
  let error = null
  try {
    bucketExists = await useMinio().bucketExists(minioBucket())
    reachable = true
  } catch (e) {
    error = e.message || 'Gagal terhubung ke MinIO'
  }
  const latencyMs = Date.now() - started

  const db = useDb()
  const [stats] = await db
    .select({
      fileCount: sql`count(*)`,
      totalBytes: sql`coalesce(sum(${schema.productFiles.sizeBytes}), 0)`
    })
    .from(schema.productFiles)

  return {
    reachable,
    bucketExists,
    error,
    latencyMs,
    endpoint: `${config.minio.endPoint}:${config.minio.port}`,
    useSSL: config.minio.useSSL,
    bucket: config.minio.bucket,
    fileCount: Number(stats?.fileCount || 0),
    totalBytes: Number(stats?.totalBytes || 0)
  }
})
