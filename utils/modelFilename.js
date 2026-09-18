// Shared filename rules are also used by Nitro server routes.
export { fileExt, fileStem, isUuidFilename, cleanModelStem } from '#shared/utils/modelFilename.js'

export function libraryUploadForm(blob, filename, mime) {
  const body = new FormData()
  const name = String(filename || 'model').split(/[/\\]/).pop() || 'model'
  body.append('file', new File([blob], name, { type: blob.type || mime || 'application/octet-stream' }))
  body.append('filename', name)
  return body
}
