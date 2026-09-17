import { basename } from 'node:path/posix'
import { inArray } from 'drizzle-orm'
import { schema } from '../db/index.js'
import { useMinio, minioBucket } from './minio.js'

const LIBRARY_PREFIX = 'library/'
const CONTENT_TYPES = {
  stl: 'model/stl',
  obj: 'model/obj',
  '3mf': 'model/3mf',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json'
}

function contentTypeForKey(key) {
  const ext = (String(key || '').split('.').pop() || '').toLowerCase()
  return CONTENT_TYPES[ext] || 'application/octet-stream'
}

function listLibraryObjects() {
  return new Promise((resolve, reject) => {
    const objects = []
    const stream = useMinio().listObjectsV2(minioBucket(), LIBRARY_PREFIX, true)
    stream.on('data', (obj) => {
      if (!obj?.name || obj.name.endsWith('/')) return
      objects.push(obj)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(objects))
  })
}

export async function syncLibraryFilesFromMinio(db) {
  const objects = await listLibraryObjects()
  if (!objects.length) return { created: 0 }

  const keys = objects.map((obj) => obj.name)
  const existingRows = await db
    .select({ objectKey: schema.libraryFiles.objectKey })
    .from(schema.libraryFiles)
    .where(inArray(schema.libraryFiles.objectKey, keys))
  const existing = new Set(existingRows.map((row) => row.objectKey))
  const missing = objects.filter((obj) => !existing.has(obj.name))
  if (!missing.length) return { created: 0 }

  await db.insert(schema.libraryFiles).values(
    missing.map((obj) => ({
      filename: basename(obj.name),
      objectKey: obj.name,
      sizeBytes: Number(obj.size || 0),
      contentType: contentTypeForKey(obj.name),
      createdAt: obj.lastModified instanceof Date ? obj.lastModified : new Date()
    }))
  )
  return { created: missing.length }
}

