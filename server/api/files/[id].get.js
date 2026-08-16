import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { useMinio, minioBucket } from '../../utils/minio.js'

// Stream isi file dari MinIO lewat server agar tetap terproteksi auth
// (browser tidak perlu akses langsung ke MinIO). ?download=1 memaksa unduh.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.productFiles).where(eq(schema.productFiles.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'File tidak ditemukan' })
  const file = rows[0]

  const stream = await useMinio().getObject(minioBucket(), file.objectKey)
  const disposition = getQuery(event).download ? 'attachment' : 'inline'
  setResponseHeaders(event, {
    'Content-Type': file.contentType || 'application/octet-stream',
    'Content-Length': String(file.sizeBytes),
    'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.filename)}"`
  })
  return sendStream(event, stream)
})
