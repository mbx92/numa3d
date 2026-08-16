import { Client } from 'minio'

let _client = null
let _bucketReady = false

export function useMinio() {
  if (!_client) {
    const { minio } = useRuntimeConfig()
    _client = new Client({
      endPoint: minio.endPoint,
      port: minio.port,
      useSSL: minio.useSSL,
      accessKey: minio.accessKey,
      secretKey: minio.secretKey
    })
  }
  return _client
}

export function minioBucket() {
  return useRuntimeConfig().minio.bucket
}

// Pastikan bucket ada sebelum operasi tulis; cukup dicek sekali per proses.
export async function ensureBucket() {
  if (_bucketReady) return
  const client = useMinio()
  const bucket = minioBucket()
  if (!(await client.bucketExists(bucket))) {
    await client.makeBucket(bucket)
  }
  _bucketReady = true
}
