import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import Module from 'manifold-3d'
import { parseSTL } from '../utils/clickerManifold/meshImport.js'

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

function rawSolid(wasm, raw, track) {
  const mesh = new wasm.Mesh({
    numProp: raw.numProp || 3,
    vertProperties: raw.vertProperties,
    triVerts: raw.triVerts
  })
  mesh.merge()
  return track(wasm.Manifold.ofMesh(mesh))
}

test('shape-mode flexi clicker shows print-in-place interlocking base hinges in preview and STL', async (t) => {
  const worker = await withClickerWorker(t)
  const message = await worker.build({
    shapeMode: 'rect',
    baseShape: 'square',
    text: 'AB',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
    flexiEnabled: true,
    flexiClearanceMm: 0.35,
    fitToleranceMm: 0.15
  })
  const { result, error } = message
  assert.ok(result, error)
  assert.equal(result.dimensions.tileCount, 2)
  assert.equal(result.dimensions.flexiJointCount, 1)
  assert.equal(result.dimensions.flexiClearanceMm, 0.35)
  assert.equal(result.basePreviewParts.length, 2)
  assert.ok(result.warnings.some((warning) => warning.includes('Flexi print-in-place aktif')))

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
  assert.ok(bbA.max[0] > bbB.min[0], 'hinge geometry overlaps in X so it is visibly interlocked')
  assert.ok(bbA.max[1] > bbB.min[1] && bbB.max[1] > bbA.min[1], 'hinge geometry overlaps in Y')
  assert.ok(track(baseA.intersect(baseB)).volume() < 0.01, 'print-in-place hinge parts keep clearance')
  const switchPreview = result.assemblyPreviewParts.find((part) => part.role === 'switch')
  assert.ok(switchPreview, 'assembly preview includes switch model')
  assert.equal(switchPreview.modelUrl, '/assets/clicker/switch-preview/cherry_mx_single.glb')
  assert.equal(switchPreview.previewOnly, true)

  const baseStl = rawSolid(wasm, parseSTL(result.baseStlBuffer), track)
  assert.equal(baseStl.status(), 'NoError')
  const components = baseStl.decompose()
  assert.ok(components.length >= 2, 'base export keeps articulated bodies separate')
  components.forEach((component) => component.delete())

  const rejected = await worker.build({
    shapeMode: 'rect',
    baseShape: 'square',
    text: 'A',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
    flexiEnabled: true
  })
  assert.match(rejected.error, /minimal 2 huruf/)

  const withHole = await worker.build({
    shapeMode: 'rect',
    baseShape: 'square',
    text: 'AB',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
    flexiEnabled: true,
    flexiConnectionStyle: 'strap',
    flexiStrapHoleMm: 4.2
  })
  assert.ok(withHole.result, withHole.error)
  assert.equal(withHole.result.dimensions.flexiConnectionStyle, 'strap')
  assert.equal(withHole.result.dimensions.flexiJointCount, 0)
  assert.equal(withHole.result.dimensions.flexiStrapHoleCount, 4)
  assert.equal(withHole.result.dimensions.flexiStrapTunnelCount, 2)
  assert.ok(withHole.result.warnings.some((warning) => warning.includes('Lubang tali')))
  assert.ok(withHole.result.assemblyPreviewParts.some((part) => part.role === 'switch'), 'strap preview includes switch model')
  assert.equal(withHole.result.basePreviewParts.some((part) => part.role === 'switch'), false)

  const strapA = previewSolid(wasm, withHole.result.basePreviewParts[0], track)
  const strapB = previewSolid(wasm, withHole.result.basePreviewParts[1], track)
  const strapBbA = strapA.boundingBox()
  const strapBbB = strapB.boundingBox()
  assert.ok(strapBbA.max[0] < strapBbB.min[0], 'strap-hole mode does not add interlocking hinge geometry')

  const holeR = withHole.result.dimensions.flexiStrapHoleMm / 2
  const tunnelY = (strapBbA.min[1] + strapBbA.max[1]) / 2
  const tunnelZ = strapBbA.min[2] + holeR + 0.65
  const tunnelLen = strapBbA.max[0] - strapBbA.min[0] - 2
  const tunnelProbe = track(
    wasm.Manifold
      .cylinder(tunnelLen, holeR * 0.65, holeR * 0.65, 48)
      .rotate([0, 90, 0])
      .translate([strapBbA.min[0] + 1, tunnelY, tunnelZ])
  )
  const materialInTunnel = track(strapA.intersect(tunnelProbe)).volume()
  assert.ok(materialInTunnel < 0.05, 'strap tunnel cuts from side to side through the vertical center of the base')
})
