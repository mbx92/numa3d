import { Client } from 'minio'

let _client = null
let _bucketReady = false
let _resolved = null

/**
 * Normalisasi konfigurasi MinIO.
 * Production sering salah isi:
 * - MINIO_ENDPOINT=https://s3.example.com  → harus hostname saja
 * - MINIO_PORT=9000 di belakang reverse-proxy HTTPS → biasanya 443
 */
export function resolveMinioConfig(raw = {}) {
  let endPoint = String(raw.endPoint || 'localhost').trim()
  let port = Number(raw.port || 9000)
  let useSSL = raw.useSSL === true || raw.useSSL === 'true'

  // Terima URL penuh di MINIO_ENDPOINT, mis. https://s3.example.com atau https://host:9000
  if (/^https?:\/\//i.test(endPoint)) {
    try {
      const u = new URL(endPoint)
      endPoint = u.hostname
      if (u.port) port = Number(u.port)
      else if (u.protocol === 'https:') port = 443
      else if (u.protocol === 'http:') port = 80
      useSSL = u.protocol === 'https:' || useSSL
    } catch {
      endPoint = endPoint.replace(/^https?:\/\//i, '').split('/')[0]
    }
  } else {
    // host:port tanpa skema
    const m = endPoint.match(/^([^:/]+)(?::(\d+))?$/)
    if (m) {
      endPoint = m[1]
      if (m[2]) port = Number(m[2])
    }
  }

  // Buang path/trailing slash jika masih ikut
  endPoint = endPoint.replace(/\/.*$/, '').replace(/:\d+$/, '') || 'localhost'

  if (!Number.isFinite(port) || port <= 0) port = useSSL ? 443 : 9000

  return {
    endPoint,
    port,
    useSSL,
    accessKey: raw.accessKey,
    secretKey: raw.secretKey,
    bucket: raw.bucket || 'numa3d-files'
  }
}

export function getResolvedMinioConfig() {
  if (!_resolved) {
    _resolved = resolveMinioConfig(useRuntimeConfig().minio)
  }
  return _resolved
}

export function useMinio() {
  if (!_client) {
    const cfg = getResolvedMinioConfig()
    _client = new Client({
      endPoint: cfg.endPoint,
      port: cfg.port,
      useSSL: cfg.useSSL,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey
    })
  }
  return _client
}

export function minioBucket() {
  return getResolvedMinioConfig().bucket
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
