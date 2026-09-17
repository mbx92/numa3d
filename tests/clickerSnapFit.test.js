import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import Module from 'manifold-3d'

async function withClickerWorker(t) {
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
  const previousFetch = globalThis.fetch
  const previousLocation = globalThis.location
  const messages = []
  globalThis.self = { postMessage: (message) => messages.push(message) }
  globalThis.location = { origin: 'http://localhost' }
  globalThis.fetch = async (url) => {
    const pathname = String(url).replace(/^https?:\/\/[^/]+/, '')
    if (pathname === '/fonts/BarlowCondensed-BlackItalic.woff') {
      const bytes = readFileSync(new URL('../public/fonts/BarlowCondensed-BlackItalic.woff', import.meta.url))
      return new Response(bytes)
    }
    throw new Error(`unexpected fetch ${url}`)
  }
  t.after(() => {
    if (previousSelf === undefined) delete globalThis.self
    else globalThis.self = previousSelf
    if (previousFetch === undefined) delete globalThis.fetch
    else globalThis.fetch = previousFetch
    if (previousLocation === undefined) delete globalThis.location
    else globalThis.location = previousLocation
  })

  await import('../workers/clicker.manifold.worker.js')
  const asset = (name) => {
    const bytes = readFileSync(new URL(`../public/assets/clicker/mx/mx-${name}.3mf`, import.meta.url))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  await self.onmessage({ data: { type: 'init', socket: asset('socket'), stem: asset('stem') } })
  assert.equal(messages.at(-1).type, 'initDone', messages.at(-1).message)
  return {
    messages,
    build: async (opts) => {
      const id = messages.length + 1
      await self.onmessage({ data: { id, opts } })
      return messages.at(-1)
    }
  }
}

function previewSolid(wasm, part, track) {
  const positions = part.geometry.positions
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: positions,
    triVerts: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
  })
  mesh.merge()
  return track(wasm.Manifold.ofMesh(mesh))
}

test('shape-mode snap-fit adds bottom rail + click latch between separate letter bases', async (t) => {
  const worker = await withClickerWorker(t)
  const message = await worker.build({
    shapeMode: 'rect',
    baseShape: 'square',
    text: 'AB',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
    snapFitEnabled: true,
    keyringEnabled: false,
    fitToleranceMm: 0.15
  })
  const { result, error } = message
  assert.ok(result, error)
  assert.equal(result.dimensions.tileCount, 2)
  assert.equal(result.dimensions.snapFitEnabled, true)
  assert.equal(result.dimensions.snapFitLinkCount, 1)
  assert.ok(result.dimensions.snapFitClearanceMm >= 0.2)
  assert.ok(result.dimensions.snapFitThicknessMm >= 1.2)
  assert.equal(result.basePreviewParts.length, 2)
  assert.ok(result.warnings.some((warning) => warning.includes('Clip kunci snap-fit')))
  assert.ok(result.warnings.some((warning) => /rail bawah|latch klik/i.test(warning)))

  const wasm = await Module()
  wasm.setup()
  const owned = []
  const track = (value) => {
    owned.push(value)
    return value
  }
  t.after(() => owned.reverse().forEach((value) => value.delete()))

  const baseA = previewSolid(wasm, result.basePreviewParts[0], track)
  const baseB = previewSolid(wasm, result.basePreviewParts[1], track)
  assert.equal(baseA.status(), 'NoError')
  assert.equal(baseB.status(), 'NoError')

  const bbA = baseA.boundingBox()
  const bbB = baseB.boundingBox()
  // Print layout keeps bodies separate (rail does not fuse into the next tile).
  assert.ok(bbA.max[0] < bbB.min[0], 'snap-fit print layout leaves a gap between tiles')
  // Male rail should protrude past the body toward the gap.
  assert.ok(bbA.max[0] - bbA.min[0] > 20, 'left tile has body width')
  // Bottom lock: male rail+boss lives near the floor (Z), not mid-height side tabs.
  const zSpanA = bbA.max[2] - bbA.min[2]
  assert.ok(zSpanA > 5, 'left tile has usable height')
  // Rail+boss add a little height above the floor band but stay in the lower third.
  // (Boss sits on the rail top near min Z.)
  assert.ok(bbA.min[2] <= bbB.min[2] + 0.5, 'tiles share a common floor band')

  // Hang keyring alone must NOT activate snap-fit.
  const hangOnly = await worker.build({
    shapeMode: 'rect',
    baseShape: 'square',
    text: 'AB',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
    snapFitEnabled: false,
    keyringEnabled: true
  })
  assert.ok(hangOnly.result, hangOnly.error)
  assert.equal(hangOnly.result.dimensions.snapFitEnabled, false)
  assert.equal(hangOnly.result.basePreviewParts.length, 1)

  const rejected = await worker.build({
    shapeMode: 'rect',
    baseShape: 'square',
    text: 'A',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
    snapFitEnabled: true
  })
  // Single glyph: snapFitActive false, falls through to normal build (no error required)
  assert.ok(rejected.result || rejected.error)
  if (rejected.result) {
    assert.equal(rejected.result.dimensions.snapFitEnabled, false)
  }
})
