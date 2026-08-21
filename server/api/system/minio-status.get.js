import { sql } from 'drizzle-orm'
import { useMinio, minioBucket, getResolvedMinioConfig } from '../../utils/minio.js'
import { useDb, schema } from '../../db/index.js'

// Cek konektivitas MinIO (tanpa membuat bucket) + ringkasan file yang tersimpan.
// Kredensial MinIO sengaja tidak diikutsertakan di response.
export default defineEventHandler(async () => {
  const started = Date.now()
  let reachable = false
  let bucketExists = false
  let error = null
  const cfg = getResolvedMinioConfig()
  try {
    bucketExists = await useMinio().bucketExists(minioBucket())
    reachable = true
  } catch (e) {
    error = e.message || 'Gagal terhubung ke MinIO'
  }
  const latencyMs = Date.now() - started

  const db = useDb()
  const [productStats] = await db
    .select({
      fileCount: sql`count(*)`,
      totalBytes: sql`coalesce(sum(${schema.productFiles.sizeBytes}), 0)`
    })
    .from(schema.productFiles)
  const [libraryStats] = await db
    .select({
      fileCount: sql`count(*)`,
      totalBytes: sql`coalesce(sum(${schema.libraryFiles.sizeBytes}), 0)`
    })
    .from(schema.libraryFiles)

  return {
    reachable,
    bucketExists,
    error,
    latencyMs,
    endpoint: `${cfg.endPoint}:${cfg.port}`,
    useSSL: cfg.useSSL,
    bucket: cfg.bucket,
    fileCount: Number(productStats?.fileCount || 0) + Number(libraryStats?.fileCount || 0),
    totalBytes: Number(productStats?.totalBytes || 0) + Number(libraryStats?.totalBytes || 0)
  }
})
