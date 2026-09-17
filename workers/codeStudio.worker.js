import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { buildCodeStudio } from '../utils/codeStudioEngine.js'

// One worker per run: terminate after result, cancellation, or timeout.
// User source is interpreted as data, never passed to eval/Function/import.
self.onmessage = async ({ data }) => {
  try {
    const wasm = await Module({ locateFile: () => wasmUrl })
    wasm.setup()
    const result = buildCodeStudio(wasm, data.source, data.values)
    const transfer = [result.geometry.positions.buffer]
    if (result.geometry.indices?.buffer) transfer.push(result.geometry.indices.buffer)
    if (result.geometry.normals?.buffer) transfer.push(result.geometry.normals.buffer)
    self.postMessage({ result }, transfer)
  } catch (error) {
    self.postMessage({ error: error?.message || 'Generate Code Studio gagal' })
  }
}
