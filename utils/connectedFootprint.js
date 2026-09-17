import * as THREE from 'three'
import { unionTextBodies } from './shapeClipper.js'

function closestOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return new THREE.Vector2(a.x + t * dx, a.y + t * dy)
}

function nearestPair(a, b) {
  let best = { distance: Infinity }
  const scan = (points, edges, reverse) => {
    for (const p of points) {
      for (let i = 0; i < edges.length; i++) {
        const q = closestOnSegment(p, edges[i], edges[(i + 1) % edges.length])
        const distance = p.distanceToSquared(q)
        if (distance < best.distance) best = { distance, a: reverse ? q : p, b: reverse ? p : q }
      }
    }
  }
  scan(a, b, false)
  scan(b, a, true)
  return best
}

/** Join disconnected backing islands with short bridges; artwork stays intact. */
export function connectFootprint(shapes, widthMm = 2) {
  const bodies = unionTextBodies(shapes)
  if (bodies.length < 2) return bodies
  const rings = bodies.map((s) => s.getPoints(24))
  const connected = new Set([0])
  const candidates = rings.map((ring, i) => i ? nearestPair(rings[0], ring) : null)
  const bridges = []
  while (connected.size < rings.length) {
    let next = -1
    for (let i = 0; i < rings.length; i++) {
      if (!connected.has(i) && (next < 0 || candidates[i].distance < candidates[next].distance)) next = i
    }
    const { a, b } = candidates[next]
    const dir = b.clone().sub(a).normalize()
    if (!dir.lengthSq()) dir.set(1, 0)
    const half = Math.max(0.5, widthMm / 2)
    const normal = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(half)
    const start = a.clone().addScaledVector(dir, -half)
    const end = b.clone().addScaledVector(dir, half)
    const bridge = new THREE.Shape([
      start.clone().add(normal), end.clone().add(normal),
      end.clone().sub(normal), start.clone().sub(normal)
    ])
    bridge.closePath()
    bridges.push(bridge)
    connected.add(next)
    for (let i = 0; i < rings.length; i++) {
      if (connected.has(i)) continue
      const pair = nearestPair(rings[next], rings[i])
      if (pair.distance < candidates[i].distance) candidates[i] = pair
    }
  }
  return unionTextBodies([...bodies, ...bridges])
}

export function connectPolygonRings(rings, widthMm = 2) {
  const shapes = rings.map((ring) => new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y))))
  return connectFootprint(shapes, widthMm).map((shape) => shape.getPoints(24).map((p) => [p.x, p.y]))
}
