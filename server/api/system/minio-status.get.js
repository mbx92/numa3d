import { useMinio, minioBucket, getResolvedMinioConfig } from '../../utils/minio.js'
import { scanMinioUsage } from '../../utils/minioUsage.js'

// Cek konektivitas MinIO (tanpa membuat bucket) + volume aktual seluruh bucket.
// Kredensial MinIO sengaja tidak diikutsertakan di response.
export default defineEventHandler(async () => {
  const started = Date.now()
  let reachable = false
  let bucketExists = false
  let error = null
  let usageError = null
  let usage = { fileCount: 0, totalBytes: 0, folders: [] }
  let latencyMs = 0
  const cfg = getResolvedMinioConfig()
  try {
    bucketExists = await useMinio().bucketExists(minioBucket())
    reachable = true
    latencyMs = Date.now() - started
    if (bucketExists) {
      try {
        usage = await scanMinioUsage()
      } catch (e) {
        usageError = e.message || 'Gagal membaca volume bucket'
      }
    }
  } catch (e) {
    error = e.message || 'Gagal terhubung ke MinIO'
    latencyMs = Date.now() - started
  }

  return {
    reachable,
    bucketExists,
    error,
    latencyMs,
    endpoint: `${cfg.endPoint}:${cfg.port}`,
    useSSL: cfg.useSSL,
    bucket: cfg.bucket,
    usageError,
    ...usage
  }
})
