import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { unzipSync } from 'fflate'

test('text generators recover from a failed font fetch and export real STL/3MF geometry', async (t) => {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(specifier === 'opentype.js' ? 'opentype.js/dist/opentype.mjs' : specifier, context)
    }
  })
  t.after(() => hooks.deregister())
  const { generateKeychain } = await import('../utils/keychainGenerator.js')
  const { generateClicker } = await import('../utils/clickerGenerator.js')
  const { generateLightbox } = await import('../utils/lightboxGenerator.js')
  const { resolveGeneratorPartExport } = await import('../utils/generatorPartExport.js')
  const font = readFileSync(new URL('../public/fonts/Roboto-Bold.woff', import.meta.url))
  let fail = true
  let fetchCount = 0
  t.mock.method(globalThis, 'fetch', async () => {
    fetchCount++
    return fail ? new Response('', { status: 503 }) : new Response(font)
  })
  for (const [name, generate, parts] of [
    ['keychain', generateKeychain, ['base', 'text']],
    ['clicker', generateClicker, ['base', 'lid']],
    ['lightbox', generateLightbox, ['face', 'body', 'stand']]
  ]) {
    const opts = { text: 'AB', fontUrl: `/fonts/${name}-retry.woff`, shapeMode: 'rect', designMode: 'text' }
    fail = true
    await assert.rejects(generate(opts), /503/)
    fail = false
    const result = await generate(opts)
    try {
      for (const part of parts) {
        const stl = await resolveGeneratorPartExport(result, part, 'stl')
        const buffer = await stl.blob.arrayBuffer()
        const triangles = new DataView(buffer).getUint32(80, true)
        assert.ok(triangles > 0, `${name}/${part} must contain triangles`)
        assert.equal(buffer.byteLength, 84 + triangles * 50)
        const threemf = await resolveGeneratorPartExport(result, part, '3mf')
        const zip = unzipSync(new Uint8Array(await threemf.blob.arrayBuffer()))
        assert.ok(zip['3D/3dmodel.model'], `${name}/${part} 3MF must contain a model`)
      }
      const zip = unzipSync(new Uint8Array(await result.getPlate3mfBlob().arrayBuffer()))
      assert.ok(zip['Metadata/project_settings.config'])
    } finally {
      result.dispose()
    }
  }
  assert.equal(fetchCount, 6, 'failed font promises must be evicted before retry')
})
