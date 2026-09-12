import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { buildQrPlate } from '../utils/qrPlateCore.js'

let wasmReady = null
function getWasm() {
  if (!wasmReady) {
    wasmReady = Module({ locateFile: () => wasmUrl }).then((wasm) => {
      wasm.setup()
      return wasm
    })
  }
  return wasmReady
}

self.onmessage = async ({ data }) => {
  const id = data?.id
  try {
    const wasm = await getWasm()
    const result = buildQrPlate(wasm, data.opts, data.fontBuffer)
    const geometries = [result.geometry, ...result.parts.map((p) => p.geometry)]
    self.postMessage({ id, result }, geometries.flatMap((g) => [g.positions.buffer, g.indices.buffer, g.normals.buffer]))
  } catch (error) { self.postMessage({ id, error: error?.message || 'Gagal membuat pelat QR' }) }
}
