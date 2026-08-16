import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'
import { useMinio, minioBucket, ensureBucket } from '../../../../utils/minio.js'
import { requireAdmin } from '../../../../utils/rbac.js'
import { logAudit } from '../../../../utils/audit.js'

const ALLOWED_EXT = {
  stl: 'model/stl',
  obj: 'model/obj',
  '3mf': 'model/3mf',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json'
}
const MAX_SIZE = 100 * 1024 * 1024 // 100 MB

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const productId = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const products = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.id, productId))
  if (!products.length) {
    throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'File wajib diunggah (field "file")' })

  const ext = (file.filename.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_EXT[ext]) {
    throw createError({
      statusCode: 400,
      statusMessage: `Format .${ext} tidak didukung. Gunakan: ${Object.keys(ALLOWED_EXT).map((e) => '.' + e).join(', ')}`
    })
  }
  if (file.data.length > MAX_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'Ukuran file maksimal 100 MB' })
  }

  const contentType = ALLOWED_EXT[ext]
  const objectKey = `products/${productId}/${randomUUID()}.${ext}`

  await ensureBucket()
  await useMinio().putObject(minioBucket(), objectKey, file.data, file.data.length, {
    'Content-Type': contentType
  })

  const rows = await db
    .insert(schema.productFiles)
    .values({
      productId,
      filename: file.filename,
      objectKey,
      sizeBytes: file.data.length,
      contentType
    })
    .returning()
  await logAudit(event, {
    action: 'create',
    entity: 'product_file',
    entityId: rows[0].id,
    summary: `Upload file 3D "${rows[0].filename}" ke produk id ${productId}`
  })
  return rows[0]
})
