import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { buildQrPlate } from '../utils/qrPlateCore.js'

self.onmessage = async ({ data }) => {
  try {
    const wasm = await Module({ locateFile: () => wasmUrl })
    wasm.setup()
    const result = buildQrPlate(wasm, data.opts, data.fontBuffer)
    const geometries = [result.geometry, ...result.parts.map((p) => p.geometry)]
    self.postMessage({ result }, geometries.flatMap((g) => [g.positions.buffer, g.indices.buffer, g.normals.buffer]))
  } catch (error) { self.postMessage({ error: error?.message || 'Gagal membuat pelat QR' }) }
}
