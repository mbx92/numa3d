import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import Module from 'manifold-3d'
import * as THREE from 'three'
import { parseSTL } from '../utils/clickerManifold/meshImport.js'
import { parseSvgToShapes, serializeShapes } from '../utils/svgToShapes.js'
import { meshToStlArrayBuffer } from '../utils/clickerManifold/meshUtils.js'
import { partsTo3mfBuffer } from '../utils/keychainExport.js'

test('SVG artwork generates printable keychains and clickers through real Manifold workers', async (t) => {
  const window = new Window()
  globalThis.DOMParser = window.DOMParser
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'manifold-3d/manifold.wasm?url') return {
        url: `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(fileURLToPath(import.meta.resolve('manifold-3d/manifold.wasm')))}`)}`,
        shortCircuit: true
      }
      return next(specifier === 'opentype.js' ? 'opentype.js/dist/opentype.mjs' : specifier, context)
    }
  })
  const { generateKeychain } = await import('../utils/keychainGenerator.js')
  const { resolveFootprint } = await import('../utils/clickerFootprint.js')
  const messages = []
  globalThis.self = { postMessage: (message) => messages.push(message) }
  t.mock.method(globalThis, 'fetch', async () => new Response(readFileSync(new URL('../public/fonts/Roboto-Bold.woff', import.meta.url))))
  t.after(async () => { delete globalThis.self; delete globalThis.DOMParser; hooks.deregister(); await window.happyDOM.close() })
  await import('../workers/clicker.manifold.worker.js')
  const asset = (name) => {
    const bytes = readFileSync(new URL(`../public/assets/clicker/mx/mx-${name}.3mf`, import.meta.url))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  await self.onmessage({ data: { type: 'init', socket: asset('socket'), stem: asset('stem') } })
  assert.equal(messages.at(-1).type, 'initDone', messages.at(-1).message)
  const wasm = await Module()
  wasm.setup()

  function solidFromRaw(raw) {
    const mesh = new wasm.Mesh(raw)
    mesh.merge()
    const solid = wasm.Manifold.ofMesh(mesh)
    assert.equal(solid.status(), 'NoError')
    assert.ok(solid.volume() > 0.01)
    return solid
  }
  function assertConnected(solid, name) {
    const pieces = solid.decompose()
    try { assert.equal(pieces.length, 1, `${name} must be one connected solid`) }
    finally { pieces.forEach((p) => p.delete()) }
  }
  function previewSolid(parts) {
    const solids = parts.map((part) => solidFromRaw({
      numProp: 3, vertProperties: part.geometry.positions,
      triVerts: Uint32Array.from({ length: part.geometry.positions.length / 3 }, (_, i) => i)
    }))
    try { return wasm.Manifold.union(solids) }
    finally { solids.forEach((s) => s.delete()) }
  }

  for (const name of ['compound', 'disconnected', 'strokes', 'narrow']) {
    const svg = readFileSync(new URL(`./fixtures/svg/${name}.svg`, import.meta.url), 'utf8')
    for (const text of ['', 'AB']) await t.test(`keychain ${name}${text ? ' + text' : ''}`, async () => {
      const result = await generateKeychain({ text, typographyId: 'straight', svgContent: svg, svgSizeMm: 28, svgGapMm: 8, targetHeightMm: 21 })
      const solids = []
      try {
        for (const [part, blob] of [['base', result.getBaseBlob()], ['insert', result.getTextBlob()]]) {
          const solid = solidFromRaw(parseSTL(await blob.arrayBuffer()))
          solids.push(solid)
          assertConnected(solid, `${name}/${part}`)
        }
        const overlap = solids[0].intersect(solids[1])
        try { assert.ok(overlap.volume() < 0.001, 'insert must fit in the tray') }
        finally { overlap.delete() }
        assert.ok(result.dimensions.heightMm < 40)
      } finally {
        solids.forEach((s) => s.delete())
        result.dispose()
      }
    })
    for (const baseShape of ['outline', 'circle']) await t.test(`clicker ${name} / ${baseShape}`, async () => {
      await self.onmessage({ data: { id: messages.length + 1, opts: {
        shapeMode: 'svg', baseShape, svgShapes: serializeShapes(parseSvgToShapes(svg)), maxSizeMm: 40,
        imageMarginMm: 1.2, displayMode: 'preview'
      } } })
      const { result, error } = messages.at(-1)
      assert.ok(result, error)
      const base = previewSolid(result.basePreviewParts)
      const lid = previewSolid(result.lidPreviewParts)
      try {
        assertConnected(base, `${name}/base`)
        assertConnected(lid, `${name}/lid`)
        const overlap = base.intersect(lid)
        try { assert.ok(overlap.volume() < 0.01, `lid/base overlap: ${overlap.volume()}`) }
        finally { overlap.delete() }
        assert.ok(result.dimensions.widthMm < 80, 'SVG must not scale up excessively to fit the switch')
        for (const [buffer, preview] of [[result.baseStlBuffer, base], [result.lidStlBuffer, lid]]) {
          const stl = solidFromRaw(parseSTL(buffer))
          assert.ok(Math.abs(stl.volume() - preview.volume()) < 0.01, 'STL and preview must describe the same volume')
          stl.delete()
        }
      } finally { base.delete(); lid.delete() }
    })
  }

  for (const baseShape of ['outline', 'circle']) for (const margin of [0, 1.2, 3]) {
    await t.test(`clicker ${baseShape} applies artwork margin ${margin} once`, async () => {
      const svg = readFileSync(new URL('./fixtures/svg/compound.svg', import.meta.url), 'utf8')
      await self.onmessage({ data: { id: messages.length + 1, opts: {
        shapeMode: 'svg', baseShape, svgShapes: serializeShapes(parseSvgToShapes(svg)),
        maxSizeMm: 40, imageMarginMm: margin
      } } })
      const { result, error } = messages.at(-1)
      assert.ok(result, error)
      const art = previewSolid(result.lidPreviewParts.filter((part) => part.name === 'top-color-0'))
      try {
        const box = art.boundingBox()
        assert.ok(Math.abs(box.max[0] - box.min[0] - (40 - margin * 2)) < 0.05, 'artwork must not be scaled against an already padded plate')
      } finally { art.delete() }
    })
  }

  const geometry = new THREE.CylinderGeometry(15, 15, 8, 201, 4)
  geometry.rotateX(Math.PI / 2)
  t.after(() => geometry.dispose())
  for (const [ext, buffer] of [
    ['stl', meshToStlArrayBuffer(geometry)],
    ['3mf', partsTo3mfBuffer([{ geometry, color: '#ff0000' }], 'mesh-regression')]
  ]) await t.test(`mesh ${ext} preserves its full footprint and builds closed parts`, async () => {
    const meshBuffer = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    const opts = { shapeMode: 'mesh', baseShape: 'outline', meshBuffer, meshFilename: `fixture.${ext}`, meshUpAxis: 'z', maxSizeMm: 40 }
    const footprint = await resolveFootprint(opts)
    assert.ok(Math.abs(footprint.bounds.width - 40) < 0.01)
    assert.ok(footprint.plateShapes[0].getPoints().length >= 201, 'do not decimate away convex hull vertices')
    await self.onmessage({ data: { id: messages.length + 1, opts } })
    const { result, error } = messages.at(-1)
    assert.ok(result, error)
    for (const [part, stl] of [['base', result.baseStlBuffer], ['lid', result.lidStlBuffer]]) {
      const solid = solidFromRaw(parseSTL(stl))
      try { assertConnected(solid, `mesh-${ext}/${part}`) }
      finally { solid.delete() }
    }
  })
})
