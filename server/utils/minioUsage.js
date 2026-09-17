import { minioBucket, useMinio } from './minio.js'

function folderForObjectKey(objectKey) {
  const key = String(objectKey || '')
  const slash = key.indexOf('/')
  return slash > 0 ? key.slice(0, slash) : '(root)'
}

export function summarizeMinioObjects(objects) {
  const usage = { folders: new Map(), fileCount: 0, totalBytes: 0 }

  for (const object of objects) addObjectToUsage(usage, object)
  return finishUsage(usage)
}

function addObjectToUsage(usage, object) {
  const name = String(object?.name || '')
  if (!name || name.endsWith('/')) return

  const size = Math.max(0, Number(object.size) || 0)
  const folder = folderForObjectKey(name)
  const current = usage.folders.get(folder) || {
    name: folder,
    prefix: folder === '(root)' ? '' : `${folder}/`,
    fileCount: 0,
    totalBytes: 0
  }

  current.fileCount += 1
  current.totalBytes += size
  usage.folders.set(folder, current)
  usage.fileCount += 1
  usage.totalBytes += size
}

function finishUsage(usage) {
  return {
    fileCount: usage.fileCount,
    totalBytes: usage.totalBytes,
    folders: [...usage.folders.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}

export function scanMinioUsage() {
  return new Promise((resolve, reject) => {
    const usage = { folders: new Map(), fileCount: 0, totalBytes: 0 }
    const stream = useMinio().listObjectsV2(minioBucket(), '', true)
    stream.on('data', (object) => addObjectToUsage(usage, object))
    stream.on('error', reject)
    stream.on('end', () => resolve(finishUsage(usage)))
  })
}
