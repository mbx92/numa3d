import { generateKeychainCore } from '../utils/keychainCore.js'

self.onmessage = async (event) => {
  const { id, opts } = event.data || {}
  try {
    const result = await generateKeychainCore(opts)
    const transferables = []
    for (const part of [...result.basePreviewParts, ...result.textPreviewParts, ...(result.assemblyPreviewParts || [])]) {
      transferables.push(part.geometry.positions.buffer)
      if (part.geometry.normals) transferables.push(part.geometry.normals.buffer)
    }
    transferables.push(result.baseStlBuffer, result.textStlBuffer)
    self.postMessage({ id, result }, transferables)
  } catch (e) {
    self.postMessage({ id, error: e?.message || 'Generate gagal' })
  }
}
