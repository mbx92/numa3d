import test from 'node:test'
import assert from 'node:assert/strict'
import Module from 'manifold-3d'
import { packManifoldMesh } from '../utils/packManifoldMesh.js'

const wasm = await Module(); wasm.setup()

test('fast crease normals preserve every triangle and manifold topology', () => {
  const cube = wasm.Manifold.cube([10, 10, 10])
  const cylinder = wasm.Manifold.cylinder(5, 8, 8, 64)
  const shifted = cube.translate([10, 10, 0])
  const touching = wasm.Manifold.union([cube, shifted])
  try {
    for (const shape of [cube, cylinder, touching]) {
      const mesh = shape.getMesh(), packed = packManifoldMesh(mesh)
      assert.equal(packed.indices.length, mesh.triVerts.length)
      for (let i = 0; i < mesh.triVerts.length; i++) for (let axis = 0; axis < 3; axis++) {
        assert.equal(packed.positions[packed.indices[i] * 3 + axis], mesh.vertProperties[mesh.triVerts[i] * mesh.numProp + axis])
      }
      for (let i = 0; i < packed.normals.length; i += 3) {
        assert.ok(Math.abs(Math.hypot(...packed.normals.subarray(i, i + 3)) - 1) < 1e-6)
        if (shape === cube) assert.equal(Math.max(...packed.normals.subarray(i, i + 3).map(Math.abs)), 1, 'cube edges remain sharp')
      }
      const restored = wasm.Manifold.ofMesh(new wasm.Mesh({ numProp: 3, vertProperties: packed.positions,
        triVerts: packed.indices, mergeFromVert: packed.mergeFromVert, mergeToVert: packed.mergeToVert }))
      try {
        assert.equal(restored.status(), 'NoError')
        assert.ok(Math.abs(restored.volume() - shape.volume()) < shape.volume() * 1e-6)
        assert.equal(restored.numTri(), shape.numTri())
      } finally { restored.delete() }
      if (shape === cylinder) {
        for (let i = 0; i < packed.normals.length; i += 3) {
          const [nx, ny, nz] = packed.normals.subarray(i, i + 3)
          if (Math.abs(nz) > 0.5) { assert.ok(Math.abs(nz) > 0.99999); continue }
          const [x, y] = packed.positions.subarray(i, i + 3)
          assert.ok((nx * x + ny * y) / Math.hypot(x, y) > 0.999, 'cylinder sides remain smoothly shaded')
        }
      }
    }
  } finally { touching.delete(); shifted.delete(); cylinder.delete(); cube.delete() }
})
