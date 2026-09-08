import { CODE_LIMITS, compileCodeStudio } from './codeStudioLanguage.js'

// Only interpreter-created nodes reach the kernel. All native solids are owned
// by this job and released, even when a boolean operation or validation fails.
export function buildCodeStudio(wasm, source, values = {}) {
  const { root, parameters, nodeCount } = compileCodeStudio(source, values)
  const owned = new Set()
  const cache = new Map()
  let retainedTriangles = 0
  function track(solid) {
    if (owned.has(solid)) return solid
    owned.add(solid)
    if (solid.status() !== 'NoError') throw new Error(`Geometri gagal: ${solid.status()}`)
    const triangles = solid.numTri()
    retainedTriangles += triangles
    if (triangles > CODE_LIMITS.triangles || retainedTriangles > 1000000) throw new Error('Mesh terlalu kompleks; kurangi sphere, repeat, atau operasi boolean')
    if (triangles) {
      const { min, max } = solid.boundingBox()
      if (![...min, ...max].every((n) => Number.isFinite(n) && Math.abs(n) <= 10000) ||
        max.some((n, i) => n - min[i] > 1000)) throw new Error('Model melebihi batas ukuran 1.000 mm atau koordinat ±10.000 mm')
    }
    return solid
  }
  function evaluate(node) {
    if (cache.has(node)) return cache.get(node)
    const a = node.args
    const M = wasm.Manifold
    let solid
    switch (node.op) {
      case 'box': solid = M.cube(a, true); break
      case 'cylinder': solid = M.cylinder(a[1], a[0], a[0], a[2], true); break
      case 'sphere': solid = M.sphere(a[0], 48); break
      case 'union': solid = M.union(a.map(evaluate)); break
      case 'subtract': solid = M.difference(a.map(evaluate)); break
      case 'intersect': solid = M.intersection(a.map(evaluate)); break
      case 'translate': solid = evaluate(a[0]).translate(a[1]); break
      case 'rotate': solid = evaluate(a[0]).rotate(a[1]); break
      case 'scale': solid = evaluate(a[0]).scale(a[1]); break
      case 'repeat': {
        const base = evaluate(a[0])
        const copies = Array.from({ length: a[1] }, (_, i) => track(base.translate(a[2].map((v) => v * i))))
        solid = M.union(copies)
        break
      }
      default: throw new Error('Operasi geometri tidak dikenal')
    }
    track(solid)
    cache.set(node, solid)
    return solid
  }
  try {
    const model = evaluate(root)
    if (!model.numTri() || model.volume() <= 0.000001) throw new Error('Hasil kosong atau tidak memiliki volume. Periksa ukuran dan operasi potong.')
    const { min, max } = model.boundingBox()
    // Preserve XY relationships; place the completed model on the print bed.
    const grounded = track(model.translate([0, 0, -min[2]]))
    const mesh = grounded.getMesh()
    const positions = new Float32Array(mesh.triVerts.length * 3)
    for (let i = 0; i < mesh.triVerts.length; i++) {
      const sourceIndex = mesh.triVerts[i] * mesh.numProp
      positions.set(mesh.vertProperties.subarray(sourceIndex, sourceIndex + 3), i * 3)
    }
    return {
      geometry: { positions, normals: null },
      parameters,
      dimensions: { widthMm: max[0] - min[0], depthMm: max[1] - min[1], heightMm: max[2] - min[2] },
      volumeMm3: grounded.volume(),
      triangles: grounded.numTri(),
      nodeCount
    }
  } finally {
    for (const solid of [...owned].reverse()) solid.delete()
  }
}
