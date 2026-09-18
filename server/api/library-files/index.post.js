import { randomUUID } from 'node:crypto'
import { useDb, schema } from '../../db/index.js'
import { useMinio, minioBucket, ensureBucket } from '../../utils/minio.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { displayLibraryFilename, fileExt } from '../../utils/modelFilename.js'

const ALLOWED_EXT = {
  stl: 'model/stl',
  obj: 'model/obj',
  '3mf': 'model/3mf',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json'
}
const MAX_SIZE = 100 * 1024 * 1024

function partText(parts, name) {
  const part = parts?.find((entry) => entry.name === name && !entry.filename)
  if (!part?.data) return ''
  return Buffer.from(part.data).toString('utf8').trim()
}

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && (p.filename || partText(parts, 'filename')))
  if (!file) throw createError({ statusCode: 400, statusMessage: 'File wajib diunggah (field "file")' })

  const filename = displayLibraryFilename({
    requested: partText(parts, 'filename'),
    multipartName: file.filename,
    objectKey: file.filename
  })
  const ext = fileExt(filename)
  if (!ALLOWED_EXT[ext]) {
    throw createError({
      statusCode: 400,
      statusMessage: `Format .${ext} tidak didukung. Gunakan: ${Object.keys(ALLOWED_EXT)
        .map((e) => '.' + e)
        .join(', ')}`
    })
  }
  if (file.data.length > MAX_SIZE) {
    throw createError({ statusCode: 413, statusMessage: 'Ukuran file maksimal 100 MB' })
  }

  const contentType = ALLOWED_EXT[ext]
  const objectKey = `library/${randomUUID()}.${ext}`

  await ensureBucket()
  await useMinio().putObject(minioBucket(), objectKey, file.data, file.data.length, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    'x-amz-meta-original-filename': encodeURIComponent(filename)
  })

  const db = useDb()
  try {
    const rows = await db
      .insert(schema.libraryFiles)
      .values({
        filename,
        objectKey,
        sizeBytes: file.data.length,
        contentType
      })
      .returning()
    await logAudit(event, {
      action: 'create',
      entity: 'library_file',
      entityId: rows[0].id,
      summary: `Upload file 3D galeri "${rows[0].filename}"`
    })
    return rows[0]
  } catch (e) {
    await useMinio().removeObject(minioBucket(), objectKey).catch(() => {})
    throw e
  }
})
