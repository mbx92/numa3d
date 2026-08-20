import { randomUUID } from 'node:crypto'
import { useMinio, minioBucket, ensureBucket } from './minio.js'

const ALLOWED_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif'
}
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

// Baca file gambar dari multipart form, validasi, unggah ke MinIO,
// kembalikan object key-nya. Tidak ada resize di server — gambar disimpan
// apa adanya dan dikecilkan lewat CSS saat ditampilkan sebagai thumbnail.
export async function putImageFile(prefix, file) {
  const ext = (file.filename.split('.').pop() || '').toLowerCase()
  const contentType = ALLOWED_EXT[ext]
  if (!contentType) {
    throw createError({
      statusCode: 400,
      statusMessage: `Format .${ext} tidak didukung. Gunakan: ${Object.keys(ALLOWED_EXT).map((e) => '.' + e).join(', ')}`
    })
  }
  if (file.data.length > MAX_IMAGE_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'Ukuran gambar maksimal 5 MB' })
  }

  const objectKey = `${prefix}/${randomUUID()}.${ext}`
  await ensureBucket()
  await useMinio().putObject(minioBucket(), objectKey, file.data, file.data.length, {
    'Content-Type': contentType
  })
  return { objectKey, contentType, sizeBytes: file.data.length, filename: file.filename }
}

export async function uploadImage(event, prefix) {
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'image' && p.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Gambar wajib diunggah (field "image")' })
  return putImageFile(prefix, file)
}

export async function uploadImages(event, prefix) {
  const parts = await readMultipartFormData(event)
  const files = (parts || []).filter((p) => (p.name === 'image' || p.name === 'images') && p.filename)
  if (!files.length) {
    throw createError({ statusCode: 400, statusMessage: 'Gambar wajib diunggah (field "image")' })
  }
  const out = []
  for (const file of files) out.push(await putImageFile(prefix, file))
  return out
}

// Hapus gambar lama; kegagalan diabaikan agar tidak memblokir update baris
// (objek yatim di MinIO lebih baik daripada update yang gagal separuh jalan).
export async function removeImageQuietly(objectKey) {
  if (!objectKey) return
  try {
    await useMinio().removeObject(minioBucket(), objectKey)
  } catch {
    // abaikan
  }
}

export async function streamImage(event, objectKey, contentTypeFallback = 'image/jpeg') {
  const ext = (objectKey.split('.').pop() || '').toLowerCase()
  const stream = await useMinio().getObject(minioBucket(), objectKey)
  setResponseHeaders(event, {
    'Content-Type': ALLOWED_EXT[ext] || contentTypeFallback,
    'Cache-Control': 'private, max-age=3600'
  })
  return sendStream(event, stream)
}
