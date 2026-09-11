// Preset bentuk base — referensi Vostok Labs clicker-generator.
import * as THREE from 'three'

function ringArea(ring) {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(area / 2)
}

function ringFromPoints(points) {
  const shape = new THREE.Shape()
  if (!points.length) return shape
  shape.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1])
  shape.closePath()
  return shape
}

export function makeCircleShape(radius, segments = 64) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false)
  return shape
}

export function makeRoundedRectShape(hw, hd, cornerR) {
  const r = Math.max(0.1, Math.min(cornerR, hw - 0.05, hd - 0.05))
  const shape = new THREE.Shape()
  shape.moveTo(-hw + r, -hd)
  shape.lineTo(hw - r, -hd)
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r)
  shape.lineTo(hw, hd - r)
  shape.quadraticCurveTo(hw, hd, hw - r, hd)
  shape.lineTo(-hw + r, hd)
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r)
  shape.lineTo(-hw, -hd + r)
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd)
  shape.closePath()
  return shape
}

export function makeHexagonShape(radius) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6
    pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
  }
  return ringFromPoints(pts)
}

export function makeEggShape(radius) {
  const steps = 96
  const width = 0.74
  const taper = 0.26
  const raw = []
  for (let i = 0; i < steps; i++) {
    const t = (Math.PI * 2 * i) / steps
    const y = radius * Math.sin(t)
    const x = radius * width * Math.cos(t) * (1 - taper * Math.sin(t))
    raw.push([x, y])
  }
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = raw.length - 1; i < raw.length; j = i++) {
    const cross = raw[j][0] * raw[i][1] - raw[i][0] * raw[j][1]
    area += cross
    cx += (raw[j][0] + raw[i][0]) * cross
    cy += (raw[j][1] + raw[i][1]) * cross
  }
  area *= 0.5
  cx /= 6 * area
  cy /= 6 * area
  return ringFromPoints(raw.map(([x, y]) => [x - cx, y - cy]))
}

/** Ray-cast point-in-polygon for closed rings from Shape.getPoints(). */
function pointInRing(x, y, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** True if axis-aligned box ±halfW × ±halfH sits inside the silhouette. */
function shapeContainsRect(shape, halfW, halfH) {
  const pts = shape.getPoints(96)
  if (pts.length < 3) return false
  const samples = []
  const edge = 12
  for (let i = 0; i <= edge; i++) {
    const t = i / edge
    const x = -halfW + 2 * halfW * t
    const y = -halfH + 2 * halfH * t
    samples.push([x, -halfH], [x, halfH], [-halfW, y], [halfW, y])
  }
  // Interior grid catches concave indents better than edges alone.
  for (let iy = 0; iy <= 4; iy++) {
    for (let ix = 0; ix <= 4; ix++) {
      samples.push([-halfW + (2 * halfW * ix) / 4, -halfH + (2 * halfH * iy) / 4])
    }
  }
  return samples.every(([x, y]) => pointInRing(x, y, pts))
}

/** Cari radius terkecil agar bentuk preset menampung kotak halfW × halfH (geometri, bukan AABB). */
export function fitShapeRadius(kind, halfW, halfH) {
  const hw = Math.max(0.01, halfW)
  const hh = Math.max(0.01, halfH)
  if (kind === 'circle' || !kind) return Math.hypot(hw, hh)
  const contains = (r) => shapeContainsRect(shapeForKind(kind, r, hw / hh), hw, hh)
  let hi = Math.max(1, Math.hypot(hw, hh))
  for (let i = 0; i < 40 && !contains(hi); i++) hi *= 2
  let lo = 1e-3
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    if (contains(mid)) hi = mid
    else lo = mid
  }
  return hi
}

export function shapeForKind(kind, radius, aspect = 1) {
  switch (kind) {
    case 'square':
      return makeRoundedRectShape(radius, radius, radius * 0.22)
    case 'rect': {
      const a = Math.min(3, Math.max(0.34, aspect))
      return makeRoundedRectShape(radius * a, radius, radius * 0.22)
    }
    case 'hexagon':
      return makeHexagonShape(radius)
    case 'egg':
      return makeEggShape(radius)
    case 'circle':
    default:
      return makeCircleShape(radius)
  }
}

export function boundsFromShape(shape) {
  const pts = shape.getPoints(64)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function ringAreaFromShape(shape) {
  const pts = shape.getPoints(64).map((p) => [p.x, p.y])
  return ringArea(pts)
}
