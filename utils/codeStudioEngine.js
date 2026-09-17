import { CODE_LIMITS, compileCodeStudio } from './codeStudioLanguage.js'
import { compileField, planField, meshField } from './codeStudioSdf.js'
import { inspectMesh } from './codeStudioHealth.js'

// Only interpreter-created nodes reach the kernel. All native solids are owned
// by this job and released, even when a boolean operation or validation fails.
export function buildCodeStudio(wasm, source, values = {}) {
  const { root, parameters, nodeCount } = compileCodeStudio(source, values)
  const owned = new Set()
  const sections = new Set()
  const cache = new Map()
  const sectionCache = new Map()
  const sampling = { work: 0, samples: 0 }
  const smoothResolutions = []
  let retainedTriangles = 0
  function trackSection(section) {
    sections.add(section)
    return section
  }
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
  function evaluateSection(node) {
    if (sectionCache.has(node)) return sectionCache.get(node)
    const a = node.args
    const CS = wasm.CrossSection
    let section
    switch (node.op) {
      case 'circle2d':
        section = CS.circle(a[0], a[1])
        break
      case 'rect2d':
        section = CS.square(a, true)
        break
      case 'polygon': {
        const [sides, radius, inner] = a
        const count = inner < 1 ? sides * 2 : sides
        const pts = []
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 - Math.PI / 2
          const r = inner < 1 && i % 2 ? radius * inner : radius
          pts.push([r * Math.cos(ang), r * Math.sin(ang)])
        }
        section = new CS([pts])
        break
      }
      case 'offset':
        section = trackSection(evaluateSection(a[0]).offset(a[1], 'Round', 2, 24)).simplify()
        break
      case 'translate2d':
        section = evaluateSection(a[0]).translate(a[1])
        break
      case 'rotate2d':
        section = evaluateSection(a[0]).rotate(a[1])
        break
      case 'scale2d':
        section = evaluateSection(a[0]).scale(a[1])
        break
      case 'union2d':
        section = CS.union(a.map(evaluateSection))
        break
      case 'subtract2d':
        section = CS.difference(a.map(evaluateSection))
        break
      case 'intersect2d':
        section = CS.intersection(a.map(evaluateSection))
        break
      default:
        throw new Error('Operasi profil 2D tidak dikenal')
    }
    trackSection(section)
    if (section.isEmpty()) throw new Error('Profil 2D kosong. Periksa offset, potong, atau ukuran polygon.')
    sectionCache.set(node, section)
    return section
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
      case 'roundedBox': {
        const radius = a[3]
        if (radius === 0) { solid = M.cube(a.slice(0, 3), true); break }
        const ball = track(M.sphere(radius, 48))
        const halfCore = a.slice(0, 3).map((v) => v / 2 - radius)
        const corners = []
        for (const x of new Set([-halfCore[0], halfCore[0]])) for (const y of new Set([-halfCore[1], halfCore[1]])) for (const z of new Set([-halfCore[2], halfCore[2]])) {
          corners.push(track(ball.translate([x, y, z])))
        }
        solid = M.hull(corners)
        break
      }
      case 'capsule': {
        const ball = track(M.sphere(a[0], 48)), offset = a[1] / 2 - a[0]
        solid = offset === 0 ? ball : M.hull([track(ball.translate([0, 0, -offset])), track(ball.translate([0, 0, offset]))])
        break
      }
      case 'hull': solid = M.hull(a.map(evaluate)); break
      case 'smoothUnion': {
        const field = compileField(node), plan = planField(field)
        solid = meshField(wasm, field, plan, sampling)
        smoothResolutions.push(plan.edgeLength)
        break
      }
      case 'torus': {
        // Torus ≈ THREE.TorusGeometry via Manifold.revolve, then optional pastry warp.
        const [major, minor, arc, segments, taper, flatten, ridges, ridgeDepth] = a
        const ring = trackSection(wasm.CrossSection.circle(minor, segments))
        const oval = flatten === 1 ? ring : trackSection(ring.scale([1, flatten]))
        const profile = trackSection(oval.translate([major, 0]))
        solid = M.revolve(profile, segments, arc)
        if (taper > 0 || ridges > 0) {
          const spun = track(solid)
          solid = spun.warp((v) => {
            const x = v[0], y = v[1], z = v[2]
            let deg = Math.atan2(y, x) * (180 / Math.PI)
            if (deg < 0) deg += 360
            if (deg > arc) deg = deg > (arc + 360) / 2 ? 0 : arc
            const along = Math.min(deg / arc, 1 - deg / arc) * 2
            const k = 1 - taper + taper * along
            const ang = Math.atan2(y, x)
            const rho = Math.hypot(x, y) || 1
            const radial = rho - major
            let nr = radial * k
            let nz = z * k
            if (ridges > 0) {
              const phi = Math.atan2(z, radial)
              const bump = 1 + ridgeDepth * Math.sin(ridges * phi) * (0.3 + 0.7 * along)
              nr *= bump
              nz *= bump
            }
            v[0] = Math.cos(ang) * (major + nr)
            v[1] = Math.sin(ang) * (major + nr)
            v[2] = nz
          })
        }
        break
      }
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
      case 'extrude':
        solid = M.extrude(evaluateSection(a[0]), a[1], a[2], a[3], [1, 1], true)
        break
      case 'revolve':
        solid = M.revolve(evaluateSection(a[0]), a[1], a[2])
        break
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
    // Generate crease-aware normals in WASM, off the UI thread. The kernel
    // duplicates property vertices only at sharp edges, retaining mesh indices.
    const shaded = track(grounded.calculateNormals(0, 35))
    const shadedMesh = shaded.getMesh()
    const shadedStride = shadedMesh.numProp
    const shadedCount = shadedMesh.vertProperties.length / shadedStride
    const renderPositions = new Float32Array(shadedCount * 3), normals = new Float32Array(shadedCount * 3)
    for (let i = 0; i < shadedCount; i++) {
      for (let j = 0; j < 3; j++) {
        renderPositions[i * 3 + j] = shadedMesh.vertProperties[i * shadedStride + j]
        normals[i * 3 + j] = shadedMesh.vertProperties[i * shadedStride + 3 + j]
      }
      const length = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
      if (!Number.isFinite(length) || length < 0.5) throw new Error('Normal mesh tidak valid')
    }
    const geometry = { positions: renderPositions, indices: new Uint32Array(shadedMesh.triVerts), normals }
    const health = {
      ...inspectMesh(geometry), smoothResolutionsMm: smoothResolutions,
      complexity: { nodes: nodeCount, cost: root.cost, fieldSamples: sampling.samples }
    }
    if (!health.closed) throw new Error('Mesh hasil memiliki topologi tidak valid; perbesar fitur kecil atau ubah sambungan')
    if (smoothResolutions.length) health.warnings.push(`Permukaan organik disampling dengan tepi mesh sekitar ${Math.max(...smoothResolutions).toFixed(3)} mm; detail di bawah resolusi dapat hilang.`)
    health.status = health.warnings.length ? 'warnings' : 'closed'
    return {
      geometry,
      health,
      parameters,
      dimensions: { widthMm: max[0] - min[0], depthMm: max[1] - min[1], heightMm: max[2] - min[2] },
      volumeMm3: grounded.volume(),
      triangles: grounded.numTri(),
      nodeCount
    }
  } finally {
    for (const solid of [...owned].reverse()) solid.delete()
    for (const section of sections) section.delete()
  }
}
