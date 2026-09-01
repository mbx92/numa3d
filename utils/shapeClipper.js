// Union + offset polygon 2D (THREE.Shape ↔ Clipper). Hanya di client.
import * as THREE from 'three'
import { ShapeUtils } from 'three'
import ClipperLib from 'clipper-lib'

const SCALE = 1000
const SHAPE_CURVE_SEGS = 10

function toClipper(points) {
  return points.map((p) => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE)
  }))
}

function fromClipper(points) {
  return points.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }))
}

function shapeToPaths(shape, curveSegs = SHAPE_CURVE_SEGS) {
  const outers = []
  const holes = []
  const outer = toClipper(shape.getPoints(curveSegs))
  if (outer.length >= 3) outers.push(outer)
  for (const hole of shape.holes || []) {
    const hp = toClipper(hole.getPoints(curveSegs))
    if (hp.length >= 3) holes.push(hp)
  }
  return { outers, holes }
}

function pathsToShape(paths) {
  if (!paths?.length) return null
  const shape = new THREE.Shape()
  const [first, ...rest] = paths
  const pts = fromClipper(first)
  pts.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y)
    else shape.lineTo(p.x, p.y)
  })
  shape.closePath()
  for (const path of rest) {
    const ring = new THREE.Path()
    const hp = fromClipper(path)
    hp.forEach((p, i) => {
      if (i === 0) ring.moveTo(p.x, p.y)
      else ring.lineTo(p.x, p.y)
    })
    ring.closePath()
    shape.holes.push(ring)
  }
  return shape
}

function roundRectPath(shape, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  shape.moveTo(x + radius, y)
  shape.lineTo(x + w - radius, y)
  shape.quadraticCurveTo(x + w, y, x + w, y + radius)
  shape.lineTo(x + w, y + h - radius)
  shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  shape.lineTo(x + radius, y + h)
  shape.quadraticCurveTo(x, y + h, x, y + h - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
}

function runClip(type, subjects, clips = []) {
  const clipper = new ClipperLib.Clipper()
  for (const p of subjects) {
    if (p?.length >= 3) clipper.AddPath(p, ClipperLib.PolyType.ptSubject, true)
  }
  for (const p of clips) {
    if (p?.length >= 3) clipper.AddPath(p, ClipperLib.PolyType.ptClip, true)
  }
  const solution = new ClipperLib.Paths()
  clipper.Execute(type, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return solution
}

/** Union isi huruf (mengisi celah antar huruf di bagian bawah — seperti contoh referensi). */
export function unionTextBodies(shapes) {
  const subjects = []
  for (const shape of shapes) {
    subjects.push(...shapeToPaths(shape).outers)
  }
  if (!subjects.length) return []
  const solution = runClip(ClipperLib.ClipType.ctUnion, subjects)
  return solution.map((path) => pathsToShape([path])).filter(Boolean)
}

/** Offset outline (mm positif = keluar) dari union atau per-huruf. */
export function offsetShapes(shapes, deltaMm) {
  if (!deltaMm) return shapes
  const united = unionTextBodies(shapes)
  const src = united.length ? united : shapes
  const subjects = []
  for (const s of src) {
    subjects.push(...shapeToPaths(s).outers)
  }
  if (!subjects.length) return shapes
  const offset = offsetPaths(subjects, deltaMm)
  return offset.map((path) => pathsToShape([path])).filter(Boolean)
}

export function offsetPaths(paths, deltaMm) {
  if (!paths?.length || !deltaMm) return paths
  const co = new ClipperLib.ClipperOffset(2, 0.25 * SCALE)
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const result = new ClipperLib.Paths()
  co.Execute(result, deltaMm * SCALE)
  return result
}

/** Shape cincin stroke: offset keluar + contour asli jadi lubang. */
export function strokeRingShape(shape, strokeMm) {
  if (!strokeMm) return null
  const { outers, holes } = shapeToPaths(shape)
  if (!outers.length) return null
  const outerPaths = offsetPaths(outers, strokeMm / 2)
  if (!outerPaths.length) return null

  const ring = pathsToShape(outerPaths)
  if (!ring) return null

  for (const inner of outers) {
    const holePts = fromClipper(inner)
    const hole = new THREE.Path()
    holePts.forEach((p, i) => {
      if (i === 0) hole.moveTo(p.x, p.y)
      else hole.lineTo(p.x, p.y)
    })
    hole.closePath()
    ring.holes.push(hole)
  }
  for (const inner of holes) {
    const holePts = fromClipper(inner)
    const hole = new THREE.Path()
    holePts.forEach((p, i) => {
      if (i === 0) hole.moveTo(p.x, p.y)
      else hole.lineTo(p.x, p.y)
    })
    hole.closePath()
    ring.holes.push(hole)
  }
  return ring
}

export function circlePath(cx, cy, radius, segments = 16) {
  const path = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    path.push({
      X: Math.round((cx + Math.cos(a) * radius) * SCALE),
      Y: Math.round((cy + Math.sin(a) * radius) * SCALE)
    })
  }
  return path
}

/** Stroke menyatu 1 grup di sekeliling seluruh teks (seperti referensi SHAREN 77). */
export function groupedStrokeRingShape(shapes, strokeMm) {
  if (!strokeMm || !shapes?.length) return null
  const united = unionTextBodies(shapes)
  const src = united.length ? united : shapes
  const innerSubjects = []
  for (const s of src) {
    innerSubjects.push(...shapeToPaths(s).outers)
  }
  if (!innerSubjects.length) return null
  const outerPaths = offsetPaths(innerSubjects, strokeMm / 2)
  if (!outerPaths.length) return null
  const ring = pathsToShape(outerPaths)
  if (!ring) return null

  for (const inner of innerSubjects) {
    const holePts = fromClipper(inner)
    const hole = new THREE.Path()
    holePts.forEach((p, i) => {
      if (i === 0) hole.moveTo(p.x, p.y)
      else hole.lineTo(p.x, p.y)
    })
    hole.closePath()
    ring.holes.push(hole)
  }
  for (const shape of shapes) {
    for (const h of shapeToPaths(shape).holes) {
      const holePts = fromClipper(h)
      const hole = new THREE.Path()
      holePts.forEach((p, i) => {
        if (i === 0) hole.moveTo(p.x, p.y)
        else hole.lineTo(p.x, p.y)
      })
      hole.closePath()
      ring.holes.push(hole)
    }
  }
  return ring
}

/** Footprint luar teks+stroke (legacy). */
export function textStrokeFootprint(shapes, strokeMm, extraMm = 0) {
  return offsetShapes(shapes, strokeMm / 2 + extraMm)
}

/** Footprint plate: inner (isi dalam teks) + outer (margin luar). */
export function buildInsertPlateFootprint(shapes, outerMarginMm = 0, innerBridgeMm = 0) {
  const united = unionTextBodies(shapes)
  let inner = united.length ? united : shapes

  if (innerBridgeMm > 0) {
    inner = offsetShapes(inner, innerBridgeMm / 2)
  }

  let outer = inner
  if (outerMarginMm > 0) {
    outer = offsetShapes(inner, outerMarginMm)
  }

  return { inner, outer, insertFootprint: outer }
}

function pathFromPoints(pts, reverse = false) {
  const list = reverse ? [...pts].reverse() : pts
  const ring = new THREE.Path()
  list.forEach((p, i) => {
    if (i === 0) ring.moveTo(p.x, p.y)
    else ring.lineTo(p.x, p.y)
  })
  ring.closePath()
  return ring
}

/** Hole wajib winding berlawanan dengan outer agar ExtrudeGeometry memotong benar. */
function holePathOppositeToOuter(outerShape, holePts) {
  const outerCW = ShapeUtils.isClockWise(outerShape.getPoints(SHAPE_CURVE_SEGS))
  const holeCW = ShapeUtils.isClockWise(holePts)
  return pathFromPoints(holePts, outerCW === holeCW)
}

function clipperPathToThreePath(path, outerShape = null) {
  const pts = fromClipper(path)
  if (outerShape) return holePathOppositeToOuter(outerShape, pts)
  return pathFromPoints(pts, false)
}

export function cloneShapes(shapes) {
  return (shapes || []).map((s) => cloneThreeShape(s))
}

/** Perbaiki winding semua lubang agar ExtrudeGeometry memotong benar. */
export function normalizeShapeHoles(shapes) {
  return (shapes || []).map((shape) => {
    const next = cloneThreeShape(shape)
    next.holes = (next.holes || []).map((h) =>
      holePathOppositeToOuter(next, h.getPoints(SHAPE_CURVE_SEGS))
    )
    return next
  })
}

function holeCentroid(holePts) {
  return {
    x: holePts.reduce((s, p) => s + p.x, 0) / holePts.length,
    y: holePts.reduce((s, p) => s + p.y, 0) / holePts.length
  }
}

function shapeHasHoleNear(shapes, cx, cy, maxDist) {
  for (const s of shapes || []) {
    for (const h of s.holes || []) {
      const pts = h.getPoints(SHAPE_CURVE_SEGS)
      if (pts.length < 3) continue
      const { x, y } = holeCentroid(pts)
      if (Math.hypot(x - cx, y - cy) <= maxDist) return true
    }
  }
  return false
}

function cloneThreeShape(shape) {
  const pts = shape.getPoints(SHAPE_CURVE_SEGS)
  const next = new THREE.Shape()
  pts.forEach((p, i) => {
    if (i === 0) next.moveTo(p.x, p.y)
    else next.lineTo(p.x, p.y)
  })
  next.closePath()
  for (const hole of shape.holes || []) {
    const hp = hole.getPoints(SHAPE_CURVE_SEGS)
    const ring = new THREE.Path()
    hp.forEach((p, i) => {
      if (i === 0) ring.moveTo(p.x, p.y)
      else ring.lineTo(p.x, p.y)
    })
    ring.closePath()
    next.holes.push(ring)
  }
  return next
}

/** Tambahkan contour dalam sebagai lubang di shape luar — untuk rim tray berlubang. */
export function shapesWithHoles(outerShapes, holeShapes) {
  if (!holeShapes?.length) return outerShapes
  const holeRings = []
  for (const hs of holeShapes) {
    const { outers, holes } = shapeToPaths(hs)
    for (const h of outers) holeRings.push(h)
    for (const h of holes) holeRings.push(h)
  }
  if (!holeRings.length) return outerShapes
  return outerShapes.map((outer) => {
    const next = cloneThreeShape(outer)
    // Perbaiki winding lubang yang sudah ada (mis. eyelet)
    next.holes = next.holes.map((h) => holePathOppositeToOuter(next, h.getPoints(SHAPE_CURVE_SEGS)))
    for (const h of holeRings) {
      next.holes.push(holePathOppositeToOuter(next, fromClipper(h)))
    }
    return next
  })
}

function pathCentroid(path) {
  const pts = fromClipper(path)
  if (!pts.length) return { x: 0, y: 0 }
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length
  }
}

/** Konversi hasil Clipper difference: path negatif = lubang di path positif pembungkus. */
function solutionToShapes(solution) {
  if (!solution?.length) return []
  const positives = []
  const negatives = []
  for (const path of solution) {
    if (ClipperLib.Clipper.Area(path) > 0) positives.push(path)
    else negatives.push(path)
  }
  if (!positives.length) return []

  const shapes = positives.map((path) => pathsToShape([path])).filter(Boolean)
  for (const negPath of negatives) {
    const { x, y } = pathCentroid(negPath)
    const pt = new THREE.Vector2(x, y)
    let host = null
    for (const shape of shapes) {
      if (typeof shape.containsPoint === 'function' && shape.containsPoint(pt)) {
        host = shape
        break
      }
    }
    if (!host) host = shapes.reduce((a, b) => (shapeArea(a) > shapeArea(b) ? a : b))
    host.holes.push(holePathOppositeToOuter(host, fromClipper(negPath)))
  }
  return shapes
}

/** Salin lubang (mis. eyelet) dari shape sumber ke hasil subtract. */
export function transferHoles(fromShapes, toShapes) {
  if (!fromShapes?.length || !toShapes?.length) return toShapes
  const result = toShapes.map((s) => cloneThreeShape(s))
  for (const src of fromShapes) {
    for (const hole of src.holes || []) {
      const pts = hole.getPoints(SHAPE_CURVE_SEGS)
      if (pts.length < 3) continue
      const host = findShapeForHole(result, pts)
      if (!host) continue
      const { x, y } = holeCentroid(pts)
      if (shapeHasHoleNear([host], x, y, 0.35)) continue
      host.holes.push(holePathOppositeToOuter(host, pts))
    }
  }
  return result
}

/** Kurangi shape 2D (outer − inner) via Clipper. */
export function subtractShapes2D(outerShapes, innerShapes) {
  const outerPaths = []
  for (const s of outerShapes || []) {
    outerPaths.push(...shapeToPaths(s).outers)
  }
  const innerPaths = []
  for (const s of innerShapes || []) {
    innerPaths.push(...shapeToPaths(s).outers)
  }
  if (!outerPaths.length) return []
  if (!innerPaths.length) return outerShapes

  const outerUnited = runClip(ClipperLib.ClipType.ctUnion, outerPaths)
  const innerUnited = runClip(ClipperLib.ClipType.ctUnion, innerPaths)
  const solution = runClip(ClipperLib.ClipType.ctDifference, outerUnited, innerUnited)
  if (!solution.length) return transferHoles(outerShapes, shapesWithHoles(outerShapes, innerShapes))
  return transferHoles(outerShapes, solutionToShapes(solution))
}

/** Layout eyelet — satu sumber kebenaran untuk posisi & offset teks. */
export function resolveEyeletLayout(opts) {
  const outerR = (opts.eyeletOuterDiameterMm ?? 8) / 2
  const innerR = (opts.keyringHoleDiameterMm ?? 4.5) / 2
  let overlap = opts.eyeletOverlapMm
  if (overlap == null && opts.eyeletInsetMm != null) {
    overlap = 2 * outerR - opts.eyeletInsetMm
  }
  overlap = overlap ?? 1.8
  const plateOuter = opts.plateOuterMarginMm ?? opts.plateMarginMm ?? 0
  const pad = opts.paddingMm ?? 0
  // Ruang kiri teks: cukup untuk eyelet + margin plate + padding body
  const attachReach = 2 * outerR - overlap + plateOuter + pad
  return { outerR, innerR, overlap, attachReach }
}

function footprintMinX(shapes) {
  let minX = Infinity
  for (const s of shapes || []) {
    for (const p of s.getPoints(10)) minX = Math.min(minX, p.x)
  }
  return Number.isFinite(minX) ? minX : 0
}

/** Posisi center eyelet relatif tepi kiri body. overlap kecil = eyelet lebih keluar. */
function eyeletCenterX(anchorMinX, outerR, overlap) {
  return anchorMinX - outerR + overlap
}

/** Lebar attachment ke kiri (mm) — untuk offset teks. */
export function getAttachmentReach(opts) {
  const type = opts.attachmentType || 'hole'
  if (type === 'hook') {
    return (opts.hookOuterDiameterMm ?? 8) * 0.9
  }
  return resolveEyeletLayout(opts).attachReach
}

function thickArcPath(cx, cy, outerR, innerR, startAngle, endAngle, segments = 14) {
  const path = []
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + ((endAngle - startAngle) * i) / segments
    path.push({
      X: Math.round((cx + Math.cos(t) * outerR) * SCALE),
      Y: Math.round((cy + Math.sin(t) * outerR) * SCALE)
    })
  }
  for (let i = segments; i >= 0; i--) {
    const t = startAngle + ((endAngle - startAngle) * i) / segments
    path.push({
      X: Math.round((cx + Math.cos(t) * innerR) * SCALE),
      Y: Math.round((cy + Math.sin(t) * innerR) * SCALE)
    })
  }
  return path
}

function rectPath(x, y, w, h) {
  return [
    { X: Math.round(x * SCALE), Y: Math.round(y * SCALE) },
    { X: Math.round((x + w) * SCALE), Y: Math.round(y * SCALE) },
    { X: Math.round((x + w) * SCALE), Y: Math.round((y + h) * SCALE) },
    { X: Math.round(x * SCALE), Y: Math.round((y + h) * SCALE) }
  ]
}

function circleToThreePath(cx, cy, radius, segments = 20) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
  }
  return pts
}

/** Shape cincin (annulus) — lubang keyring via extrude, winding eksplisit. */
export function buildAnnulusShape(cx, cy, outerR, innerR, segments = 32) {
  const shape = new THREE.Shape()
  shape.absarc(cx, cy, outerR, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(cx, cy, innerR, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

function circleFootprint(cx, cy, radius, segments = 24) {
  const shape = new THREE.Shape()
  shape.absarc(cx, cy, radius, 0, Math.PI * 2, false)
  return shape
}

/** Buang area disk dari shapes — eyelet jadi part ring terpisah tanpa overlap. */
export function subtractDiskFromShapes(shapes, cx, cy, radius) {
  if (!shapes?.length || radius <= 0) return shapes
  return subtractShapes2D(shapes, [circleFootprint(cx, cy, radius)])
}

function shapeArea(shape) {
  const pts = shape.getPoints(8)
  if (pts.length < 3) return 0
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function holeProbePoint(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  let maxR = 0
  for (const p of pts) {
    const r = Math.hypot(p.x - cx, p.y - cy)
    if (r > maxR) maxR = r
  }
  // Titik sedikit di luar tepi lubang — di material solid (pusat lubang = void)
  return new THREE.Vector2(cx + maxR * 1.2, cy)
}

function findShapeForHole(shapes, holePts) {
  const probe = holeProbePoint(holePts)
  for (const s of shapes) {
    if (typeof s.containsPoint === 'function' && s.containsPoint(probe)) return s
  }
  for (const s of shapes) {
    const boxPts = s.getPoints(8)
    const xs = boxPts.map((p) => p.x)
    const ys = boxPts.map((p) => p.y)
    if (
      probe.x >= Math.min(...xs) &&
      probe.x <= Math.max(...xs) &&
      probe.y >= Math.min(...ys) &&
      probe.y <= Math.max(...ys)
    ) {
      return s
    }
  }
  return shapes.reduce((a, b) => (shapeArea(a) > shapeArea(b) ? a : b))
}

function shapeOverlapsEyelet(shape, eyelet) {
  const pts = shape.getPoints(8)
  if (!pts.length) return false
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return !(
    eyelet.cx + eyelet.outerR < minX ||
    eyelet.cx - eyelet.outerR > maxX ||
    eyelet.cy + eyelet.outerR < minY ||
    eyelet.cy - eyelet.outerR > maxY
  )
}

function addHoleToContainingShape(shapes, cx, cy, holeR) {
  const holePts = circleToThreePath(cx, cy, holeR)
  const host = findShapeForHole(shapes, holePts)
  host.holes.push(holePathOppositeToOuter(host, holePts))
}

/** Tambahkan lubang eyelet ke shape rim setelah subtract. */
export function applyEyeletHole(shapes, eyelet) {
  if (!eyelet || !shapes?.length) return shapes
  if (shapeHasHoleNear(shapes, eyelet.cx, eyelet.cy, eyelet.innerR * 0.85)) return shapes

  const holePts = circleToThreePath(eyelet.cx, eyelet.cy, eyelet.innerR)
  let added = false
  for (const shape of shapes) {
    if (!shapeOverlapsEyelet(shape, eyelet)) continue
    shape.holes.push(holePathOppositeToOuter(shape, holePts))
    added = true
  }
  if (!added) addHoleToContainingShape(shapes, eyelet.cx, eyelet.cy, eyelet.innerR)
  return shapes
}

/** Eyelet: disk luar union body, lubang ring sebagai Shape.hole (tembus saat extrude). */
function buildEyeletSilhouette(textPaths, anchorMinX, bounds, opts) {
  const { minY, maxY } = bounds
  const cy = (minY + maxY) / 2
  const { outerR, innerR, overlap } = resolveEyeletLayout(opts)
  const cx = eyeletCenterX(anchorMinX, outerR, overlap)

  const bodyPaths = runClip(ClipperLib.ClipType.ctUnion, [
    ...textPaths,
    circlePath(cx, cy, outerR)
  ])
  const shapes = bodyPaths.map((path) => pathsToShape([path])).filter(Boolean)
  if (shapes.length) addHoleToContainingShape(shapes, cx, cy, innerR)

  return { shapes, left: cx - outerR, eyelet: { cx, cy, outerR, innerR } }
}

/** Hook C-ring terbuka — bukaan menghadap kanan-bawah (mudah dikait). */
function buildHookPaths(bounds, opts) {
  const { minX, minY, maxY } = bounds
  const cy = (minY + maxY) / 2
  const outerR = (opts.hookOuterDiameterMm ?? 8) / 2
  const innerR = Math.max(outerR - (opts.hookThicknessMm ?? 2.2), outerR * 0.35)
  const cx = minX - outerR * 0.8
  const gapHalf = (((opts.hookGapDegrees ?? 48) / 2) * Math.PI) / 180
  const startAngle = -gapHalf
  const endAngle = Math.PI * 2 - gapHalf
  const hookRing = thickArcPath(cx, cy, outerR, innerR, startAngle, endAngle)
  const bridgeH = Math.min(innerR * 1.4, (maxY - minY) * 0.35)
  const bridge = rectPath(minX - outerR * 0.45, cy - bridgeH / 2, outerR * 0.5, bridgeH)
  return { paths: [hookRing, bridge], left: cx - outerR }
}

/** Siluet base: bodyFootprint (insert + padding) + eyelet/hook menyatu. */
export function buildBaseSilhouette(bodyFootprint, bounds, opts) {
  const { minY, maxY } = bounds
  const attachmentType = opts.attachmentType || 'hole'

  const textPaths = []
  for (const s of bodyFootprint) {
    textPaths.push(...shapeToPaths(s).outers)
  }

  let shapes
  let left
  let eyelet = null

  if (attachmentType === 'hook') {
    const attach = buildHookPaths(bounds, opts)
    const merged = runClip(ClipperLib.ClipType.ctUnion, [...textPaths, ...attach.paths])
    shapes = merged.map((path) => pathsToShape([path])).filter(Boolean)
    left = attach.left
  } else {
    const anchorMinX = footprintMinX(bodyFootprint)
    const built = buildEyeletSilhouette(textPaths, anchorMinX, bounds, opts)
    shapes = built.shapes
    left = built.left
    eyelet = built.eyelet
  }

  let minX = Infinity
  let maxX = -Infinity
  let minYB = Infinity
  let maxYB = -Infinity
  for (const s of shapes) {
    for (const p of s.getPoints(10)) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minYB = Math.min(minYB, p.y)
      maxYB = Math.max(maxYB, p.y)
    }
  }

  const box = {
    left: Number.isFinite(minX) ? minX : left,
    right: Number.isFinite(maxX) ? maxX : bounds.maxX,
    bottom: Number.isFinite(minYB) ? minYB : minY,
    top: Number.isFinite(maxYB) ? maxYB : maxY,
    width: Number.isFinite(maxX) && Number.isFinite(minX) ? maxX - minX : bounds.width,
    height: Number.isFinite(maxYB) && Number.isFinite(minYB) ? maxYB - minYB : maxY - minY
  }
  return { shapes, box, eyelet }
}
