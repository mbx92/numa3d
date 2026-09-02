import { generateLightboxCore } from '../utils/lightboxCore.js'

function toArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  }
  return null
}

function collectTransferables(result) {
  const seen = new Set()
  const transferables = []

  function add(buf) {
    const ab = toArrayBuffer(buf)
    if (!ab || seen.has(ab)) return
    seen.add(ab)
    transferables.push(ab)
  }

  for (const part of [
    ...(result.frontSidePreviewParts || []),
    ...(result.backPreviewParts || []),
    ...(result.facePreviewParts || result.basePreviewParts || []),
    ...(result.bodyPreviewParts || result.lidPreviewParts || []),
    ...(result.standPreviewParts || []),
    ...(result.standExportPreviewParts || []),
    ...(result.assemblyPreviewParts || [])
  ]) {
    add(part.geometry.positions?.buffer)
    add(part.geometry.normals?.buffer)
  }
  add(result.frontSideStlBuffer)
  add(result.backStlBuffer)
  add(result.baseStlBuffer)
  add(result.bodyStlBuffer || result.lidStlBuffer)
  add(result.lidStlBuffer)
  add(result.accentStlBuffer)
  add(result.standStlBuffer)

  return transferables
}

self.onmessage = async (event) => {
  const { id, opts } = event.data || {}
  try {
    const result = await generateLightboxCore(opts)
    self.postMessage({ id, result }, collectTransferables(result))
  } catch (e) {
    self.postMessage({ id, error: e?.message || 'Generate gagal' })
  }
}
