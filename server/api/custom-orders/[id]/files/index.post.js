import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'
import { useMinio, minioBucket, ensureBucket } from '../../../../utils/minio.js'
import { logAudit } from '../../../../utils/audit.js'

const ALLOWED_EXT = {
  stl: 'model/stl',
  obj: 'model/obj',
  '3mf': 'model/3mf',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  zip: 'application/zip'
}
const MAX_SIZE = 100 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const customOrderId = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const orders = await db
    .select({ id: schema.customOrders.id })
    .from(schema.customOrders)
    .where(eq(schema.customOrders.id, customOrderId))
  if (!orders.length) throw createError({ statusCode: 404, statusMessage: 'Pesanan custom tidak ditemukan' })

  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'File wajib diunggah (field "file")' })

  const ext = (file.filename.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_EXT[ext]) {
    throw createError({
      statusCode: 400,
      statusMessage: `Format .${ext} tidak didukung. Gunakan file 3D, gambar, PDF, atau ZIP.`
    })
  }
  if (file.data.length > MAX_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'Ukuran file maksimal 100 MB' })
  }

  const contentType = ALLOWED_EXT[ext]
  const objectKey = `custom-orders/${customOrderId}/${randomUUID()}.${ext}`
  await ensureBucket()
  await useMinio().putObject(minioBucket(), objectKey, file.data, file.data.length, {
    'Content-Type': contentType
  })

  const rows = await db
    .insert(schema.customOrderFiles)
    .values({
      customOrderId,
      filename: file.filename,
      objectKey,
      sizeBytes: file.data.length,
      contentType
    })
    .returning()
  await logAudit(event, {
    action: 'create',
    entity: 'custom_order_file',
    entityId: rows[0].id,
    summary: `Upload file "${rows[0].filename}" ke pesanan custom id ${customOrderId}`
  })
  return rows[0]
})
