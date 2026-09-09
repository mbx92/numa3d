import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import Module from 'manifold-3d'
import { parseSTL } from '../utils/clickerManifold/meshImport.js'

test('keychain Manifold solids are closed, have volume, and keep insert roles', async (t) => {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(specifier === 'opentype.js' ? 'opentype.js/dist/opentype.mjs' : specifier, context)
    }
  })
  t.after(() => hooks.deregister())
  const { generateKeychain, KEYCHAIN_DEFAULTS } = await import('../utils/keychainGenerator.js')
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = String(url).includes('Barlow')
      ? '../public/fonts/BarlowCondensed-BlackItalic.woff'
      : '../public/fonts/Roboto-Bold.woff'
    return new Response(readFileSync(new URL(path, import.meta.url)))
  })
  const wasm = await Module()
  wasm.setup()

  async function assertSolid(name, blob) {
    const raw = parseSTL(await blob.arrayBuffer())
    const mesh = new wasm.Mesh(raw)
    mesh.merge()
    const solid = wasm.Manifold.ofMesh(mesh)
    try {
      assert.equal(solid.status(), 'NoError', name)
      assert.ok(solid.volume() > 1, `${name} volume`)
      assert.ok(solid.numTri() > 20, `${name} triangles`)
    } finally {
      solid.delete()
    }
  }

  const result = await generateKeychain({
    ...KEYCHAIN_DEFAULTS,
    text: 'AB',
    fontUrl: '/fonts/Roboto-Bold.woff',
    typographyId: 'straight'
  })
  try {
    await assertSolid('base', result.getBaseBlob())
    await assertSolid('text', result.getTextBlob())
    assert.ok(result.dimensions.widthMm > 10)
    assert.ok(result.dimensions.heightMm > 4)
    const roles = result.textPreviewParts.map((p) => p.role)
    assert.ok(roles.includes('letter'))
    assert.ok(roles.includes('plateInner'))
    for (const part of [...result.basePreviewParts, ...result.textPreviewParts]) {
      if (part.line) continue
      const n = part.geometry.attributes.normal
      assert.ok(n?.count > 0, `${part.role} normals`)
      assert.equal(n.count, part.geometry.attributes.position.count)
    }
  } finally {
    result.dispose()
  }

  const sports = await generateKeychain({
    ...KEYCHAIN_DEFAULTS,
    text: 'NUMA 3D',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff'
  })
  try {
    await assertSolid('sports-base', sports.getBaseBlob())
    await assertSolid('sports-text', sports.getTextBlob())
  } finally {
    sports.dispose()
  }

  const hook = await generateKeychain({
    ...KEYCHAIN_DEFAULTS,
    text: 'AB',
    fontUrl: '/fonts/Roboto-Bold.woff',
    typographyId: 'straight',
    attachmentType: 'hook'
  })
  try {
    await assertSolid('hook-base', hook.getBaseBlob())
    await assertSolid('hook-text', hook.getTextBlob())
  } finally {
    hook.dispose()
  }
})
