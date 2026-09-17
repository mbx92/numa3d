import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import Module from 'manifold-3d'
import { parse3MF } from '../utils/clickerManifold/threemfImport.js'
import { parseSTL } from '../utils/clickerManifold/meshImport.js'

test('ordinary clicker preserves the calibrated MX socket and stem profiles in preview and STL', async (t) => {
  // Resolve browser bundler imports so the real worker can run in Node.
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'manifold-3d/manifold.wasm?url') {
        const path = fileURLToPath(import.meta.resolve('manifold-3d/manifold.wasm'))
        const source = `export default ${JSON.stringify(path)}`
        return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
      }
      if (specifier === 'opentype.js') {
        return nextResolve('opentype.js/dist/opentype.mjs', context)
      }
      return nextResolve(specifier, context)
    }
  })
  t.after(() => hooks.deregister())
  const previousSelf = globalThis.self
  const messages = []
  globalThis.self = { postMessage: (message) => messages.push(message) }
  t.after(() => {
    if (previousSelf === undefined) delete globalThis.self
    else globalThis.self = previousSelf
  })
  await import('../workers/clicker.manifold.worker.js')
  const asset = (name) => {
    const bytes = readFileSync(new URL(`../public/assets/clicker/mx/mx-${name}.3mf`, import.meta.url))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  const socketBuffer = asset('socket')
  const stemBuffer = asset('stem')
  await self.onmessage({ data: { type: 'init', socket: socketBuffer, stem: stemBuffer } })
  assert.equal(messages.at(-1).type, 'initDone', messages.at(-1).message)
  await self.onmessage({ data: { id: 1, opts: { shapeMode: 'rect', baseShape: 'square', text: '', fitToleranceMm: 0.15 } } })
  const { result, error } = messages.at(-1)
  assert.ok(result, error)

  const wasm = await Module()
  wasm.setup()
  const owned = []
  const track = (value) => { owned.push(value); return value }
  t.after(() => owned.reverse().forEach((value) => value.delete()))
  const solid = (raw) => {
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: raw.vertProperties, triVerts: raw.triVerts })
    mesh.merge()
    return track(wasm.Manifold.ofMesh(mesh))
  }
  const centered = (raw, socket = false) => {
    const part = solid(raw)
    const { min, max } = part.boundingBox()
    return track(part.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, socket ? -max[2] : 0]))
  }
  const socket = centered(parse3MF(socketBuffer), true)
  const stem = centered(parse3MF(stemBuffer))
  const socketBounds = socket.boundingBox()
  const scale = 1 + 0.3 / (socketBounds.max[0] - socketBounds.min[0])
  const fittedSocket = track(socket.scale([scale, scale, 1]))
  const crop = track(wasm.CrossSection.square([20, 20], true))
  const sameSection = (actual, expected, label) => {
    const extra = track(actual.subtract(expected)).area()
    const missing = track(expected.subtract(actual)).area()
    assert.ok(extra + missing < 0.002, `${label}: profile differs by ${extra + missing} mm²`)
  }
  const previewSolid = (part) => solid({
    vertProperties: part.geometry.positions,
    triVerts: Uint32Array.from({ length: part.geometry.positions.length / 3 }, (_, i) => i)
  })
  for (const [format, base, lid] of [
    ['preview', previewSolid(result.basePreviewParts[0]), previewSolid(result.lidPreviewParts[0])],
    ['STL', solid(parseSTL(result.baseStlBuffer)), solid(parseSTL(result.lidStlBuffer))]
  ]) {
    assert.equal(base.status(), 'NoError')
    assert.equal(lid.status(), 'NoError')
    for (const z of [-1, -4, -7]) {
      const cavity = track(crop.subtract(track(base.slice(z))))
      sameSection(cavity, track(fittedSocket.slice(z)), `${format} socket at Z=${z}`)
    }
    for (const z of [5, 7, 9]) {
      const profile = track(track(lid.slice(z)).intersect(crop))
      sameSection(profile, track(stem.slice(z)), `${format} stem at Z=${z}`)
    }
  }
})
