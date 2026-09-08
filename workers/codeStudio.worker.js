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
    self.postMessage({ result }, [result.geometry.positions.buffer])
  } catch (error) {
    self.postMessage({ error: error?.message || 'Generate Code Studio gagal' })
  }
}
