import { generateKeychainCore } from '../utils/keychainCore.js'

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
    ...result.basePreviewParts,
    ...result.textPreviewParts,
    ...(result.assemblyPreviewParts || [])
  ]) {
    add(part.geometry.positions?.buffer)
    add(part.geometry.normals?.buffer)
  }
  add(result.baseStlBuffer)
  add(result.textStlBuffer)
  add(result.baseMergedExportGeometry?.positions?.buffer)
  add(result.baseMergedExportGeometry?.normals?.buffer)

  return transferables
}

self.onmessage = async (event) => {
  const { id, opts } = event.data || {}
  try {
    const result = await generateKeychainCore(opts)
    self.postMessage({ id, result }, collectTransferables(result))
  } catch (e) {
    self.postMessage({ id, error: e?.message || 'Generate gagal' })
  }
}
