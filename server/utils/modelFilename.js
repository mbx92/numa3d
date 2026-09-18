import { sanitizeText } from './sanitizeText.js'
import { cleanModelStem, fileExt, fileStem, isUuidFilename } from '#shared/utils/modelFilename.js'

export { fileExt, fileStem, isUuidFilename }

export function renameModelFilename(input, currentFilename) {
  const ext = fileExt(currentFilename)
  const name = cleanModelStem(sanitizeText(input))
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Nama file wajib diisi' })
  }
  return ext ? `${name}.${ext}` : name
}

// Nama tampilan galeri: field form / nama multipart, bukan UUID object MinIO.
export function displayLibraryFilename({ requested, multipartName, objectKey } = {}) {
  const ext = fileExt(multipartName) || fileExt(objectKey) || fileExt(requested) || '3mf'
  for (const candidate of [requested, multipartName]) {
    if (!candidate) continue
    const name = cleanModelStem(sanitizeText(candidate))
    if (name && !isUuidFilename(name)) return `${name}.${ext}`
  }
  return `model.${ext}`
}
