import { CODE_LIMITS } from './codeStudioLanguage.js'

/** @typedef {{ min: number[], max: number[] }} Bounds */
/** @typedef {{ distance: (x: number, y: number, z: number) => number, bounds: Bounds, feature: number, cost: number }} Field */

const centered = (half) => ({ min: half.map((v) => -v), max: half })
const envelope = (bounds) => ({
  min: [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i]))),
  max: [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i])))
})
const expand = (b, delta) => ({ min: b.min.map((v) => v - delta), max: b.max.map((v) => v + delta) })
const move = (b, v) => ({ min: b.min.map((n, i) => n + v[i]), max: b.max.map((n, i) => n + v[i]) })

// Negative inside. Polynomial smooth-min changes the surface by at most k/4.
export function smoothMinimum(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k / 4
}

// Manifold applies rotations about global X, then Y, then Z.
function rotation(angles) {
  const [x, y, z] = angles.map((v) => v * Math.PI / 180)
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z)
  return [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, -sy, cy * sx, cy * cx]
}

/** Compile validated IR to an analytic field, without renderer or native handles. */
export function compileField(root) {
  const cache = new Map()
  function build(node) {
    if (cache.has(node)) return cache.get(node)
    const a = node.args
    /** @type {Field} */
    let field
    switch (node.op) {
      case 'box': case 'roundedBox': {
        const half = a.slice(0, 3).map((v) => v / 2), r = a[3] || 0
        field = { bounds: centered(half), feature: Math.min(...half, r || Infinity), cost: 1,
          distance(x, y, z) {
            const qx = Math.abs(x) - half[0] + r, qy = Math.abs(y) - half[1] + r, qz = Math.abs(z) - half[2] + r
            return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r
          } }
        break
      }
      case 'sphere':
        field = { bounds: centered([a[0], a[0], a[0]]), feature: a[0], cost: 1, distance: (x, y, z) => Math.hypot(x, y, z) - a[0] }
        break
      case 'capsule': {
        const [r, height] = a, segment = height / 2 - r
        field = { bounds: centered([r, r, height / 2]), feature: r, cost: 1,
          distance: (x, y, z) => Math.hypot(x, y, Math.max(Math.abs(z) - segment, 0)) - r }
        break
      }
      case 'cylinder': {
        const [r, height] = a
        field = { bounds: centered([r, r, height / 2]), feature: Math.min(r, height / 2), cost: 1,
          distance(x, y, z) {
            const radial = Math.hypot(x, y) - r, axial = Math.abs(z) - height / 2
            return Math.min(Math.max(radial, axial), 0) + Math.hypot(Math.max(radial, 0), Math.max(axial, 0))
          } }
        break
      }
      case 'translate': case 'rotate': case 'scale': {
        const f = build(a[0]), v = a[1]
        field = { ...f, cost: f.cost + 1 }
        if (node.op === 'translate') {
          field.bounds = move(f.bounds, v)
          field.distance = (x, y, z) => f.distance(x - v[0], y - v[1], z - v[2])
        } else if (node.op === 'scale') {
          if (!v.every((s) => s === v[0])) throw new Error('SDF memerlukan scale seragam')
          field.bounds = { min: f.bounds.min.map((n) => n * v[0]), max: f.bounds.max.map((n) => n * v[0]) }
          field.feature *= v[0]
          field.distance = (x, y, z) => f.distance(x / v[0], y / v[0], z / v[0]) * v[0]
        } else {
          const m = rotation(v), corners = []
          for (const x of [f.bounds.min[0], f.bounds.max[0]]) for (const y of [f.bounds.min[1], f.bounds.max[1]]) for (const z of [f.bounds.min[2], f.bounds.max[2]]) {
            const p = [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]
            corners.push({ min: p, max: p })
          }
          field.bounds = envelope(corners)
          field.distance = (x, y, z) => f.distance(m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z)
        }
        break
      }
      case 'union': case 'smoothUnion': {
        const fields = (node.op === 'union' ? a : a.slice(0, 2)).map(build)
        const bounds = envelope(fields.map((f) => f.bounds))
        field = { bounds, feature: Math.min(...fields.map((f) => f.feature)), cost: 1 + fields.reduce((s, f) => s + f.cost, 0),
          distance(x, y, z) {
            let d = Infinity
            for (const f of fields) d = Math.min(d, f.distance(x, y, z))
            return d
          } }
        if (node.op === 'smoothUnion') {
          field.bounds = expand(bounds, a[2] / 4)
          field.feature = Math.min(field.feature, a[2])
          field.distance = (x, y, z) => smoothMinimum(fields[0].distance(x, y, z), fields[1].distance(x, y, z), a[2])
        }
        break
      }
      case 'repeat': {
        const f = build(a[0]), count = a[1], delta = a[2]
        field = { ...f, bounds: envelope([f.bounds, move(f.bounds, delta.map((v) => v * (count - 1)))]), cost: (f.cost + 1) * count,
          distance(x, y, z) {
            let d = Infinity
            for (let i = 0; i < count; i++) d = Math.min(d, f.distance(x - i * delta[0], y - i * delta[1], z - i * delta[2]))
            return d
          } }
        break
      }
      default: throw new Error(`SDF belum mendukung ${node.op}`)
    }
    if (![...field.bounds.min, ...field.bounds.max].every((v) => Number.isFinite(v) && Math.abs(v) <= 10000) || field.bounds.max.some((v, i) => v - field.bounds.min[i] > 1000)) {
      throw new Error('smoothUnion melebihi batas ukuran atau koordinat pada input')
    }
    cache.set(node, field)
    return field
  }
  return build(root)
}

/**
 * Preflight the entire finite domain; never silently coarsen small features.
 * @param {Field} field
 */
export function planField(field) {
  const span = field.bounds.max.map((v, i) => v - field.bounds.min[i])
  if (![...field.bounds.min, ...field.bounds.max].every((v) => Number.isFinite(v) && Math.abs(v) <= 10000) || span.some((v) => v > 1000)) throw new Error('smoothUnion melebihi batas ukuran atau koordinat')
  const edgeLength = Math.min(Math.max(...span) / 64, field.feature / 3)
  const bounds = expand(field.bounds, 2 * edgeLength)
  const axes = bounds.max.map((v, i) => Math.ceil((v - bounds.min[i]) / edgeLength) + 2)
  const cells = axes.reduce((p, v) => p * v, 1)
  const work = cells * 2 * field.cost
  if (!Number.isFinite(cells) || axes.some((v) => v > CODE_LIMITS.fieldAxis) || cells > CODE_LIMITS.fieldCells || work > CODE_LIMITS.fieldWork) {
    throw new Error('smoothUnion terlalu rinci atau luas; perbesar radius blend/fitur terkecil, dekatkan bentuk, atau sederhanakan input')
  }
  return { bounds, edgeLength, cells, work }
}

/**
 * @param {import('manifold-3d').ManifoldToplevel} wasm
 * @param {Field} field
 * @param {ReturnType<typeof planField>} plan
 * @param {{ work: number, samples: number, evaluations?: number }} budget
 */
export function meshField(wasm, field, plan, budget) {
  budget.work += plan.work
  if (budget.work > CODE_LIMITS.fieldWork) throw new Error('Total sampling smoothUnion terlalu kompleks; kurangi operasi smooth')
  return wasm.Manifold.levelSet(([x, y, z]) => {
    if (++budget.samples > CODE_LIMITS.fieldSamples) throw new Error('Sampling smoothUnion melewati batas aman')
    budget.evaluations = (budget.evaluations || 0) + field.cost
    if (budget.evaluations > CODE_LIMITS.fieldWork) throw new Error('Evaluasi smoothUnion melewati batas aman; sederhanakan input')
    // Manifold's level-set uses the opposite sign convention.
    return -field.distance(x, y, z)
  }, plan.bounds, plan.edgeLength)
}
