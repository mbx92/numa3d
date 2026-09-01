import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const CREASE_ANGLE_RAD = (35 * Math.PI) / 180

export function hexToRgb(hex) {
  const h = String(hex || '#888888').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function partToGeometry(part) {
  const geo = new THREE.BufferGeometry()
  const np = part.numProp || 3
  let positions = part.vertProperties
  if (np !== 3) {
    const count = positions.length / np
    const flat = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      flat[i * 3] = positions[i * np]
      flat[i * 3 + 1] = positions[i * np + 1]
      flat[i * 3 + 2] = positions[i * np + 2]
    }
    positions = flat
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(part.triVerts, 1))
  return toCreasedNormals(geo, CREASE_ANGLE_RAD)
}

export function meshToStlArrayBuffer(geo) {
  const soup = geo.index ? geo.toNonIndexed() : geo
  const mesh = new THREE.Mesh(soup, new THREE.MeshStandardMaterial())
  mesh.updateMatrixWorld(true)
  const exporter = new STLExporter()
  const data = exporter.parse(mesh, { binary: true })
  if (soup !== geo) soup.dispose()
  if (data instanceof ArrayBuffer) return data.slice(0)
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  }
  return new TextEncoder().encode(String(data)).buffer
}

export function partsToGeometries(parts, group) {
  const geos = []
  for (const p of parts) {
    if (p.group !== group) continue
    geos.push(partToGeometry(p))
  }
  if (!geos.length) return null
  const normalized = geos.map((g) => (g.index ? g.toNonIndexed() : g))
  geos.forEach((g, i) => {
    if (normalized[i] !== g) g.dispose()
  })
  if (normalized.length === 1) return normalized[0]
  const merged = mergeGeometries(normalized, false)
  normalized.forEach((g) => g.dispose())
  if (!merged) return null
  return toCreasedNormals(merged, CREASE_ANGLE_RAD)
}

function ringPerimeter(ring) {
  let len = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j]
    const [x1, y1] = ring[i]
    len += Math.hypot(x1 - x0, y1 - y0)
  }
  return len
}

/** Segmen adaptif dari keliling bentuk — ~1 titik per 0.5 mm, dibatasi 48–128. */
export function adaptiveRingSegments(shapes, minSegs = 48, maxSegs = 128, mmPerSeg = 0.5) {
  const list = shapes || []
  if (!list.length) return minSegs
  let total = 0
  for (const shape of list) {
    const ring = shape.getPoints(16).map((p) => [p.x, p.y])
    total += ringPerimeter(ring)
  }
  const avg = total / list.length
  return Math.min(maxSegs, Math.max(minSegs, Math.ceil(avg / mmPerSeg)))
}

/** Bentuk THREE.Shape → ring [x,y][] untuk Manifold CrossSection. */
export function shapesToRings(shapes, segs = 24) {
  const rings = []
  for (const shape of shapes || []) {
    const pts = shape.getPoints(segs)
    if (pts.length >= 3) rings.push(pts.map((p) => [p.x, p.y]))
  }
  return rings
}
