// Core clicker construction using manifold-3d WASM.
// Ported from Vostok Labs buildClicker.ts — button-in-bezel geometry.
//
// Design (button-in-bezel):
//   BASE (body): solid block, recessed WELL on top, MX socket in well floor.
//   TOP (cap): flat plate + stem underneath, nests inside the well.
//
//   plate  = image footprint + frame
//   well   = plate + tolerance (cap slip-fit)
//   body   = well + border (bezel wall)
//
// Z = 0 is the switch plate top. Socket cuts downward; stem rises to +Z.

// Round offset arc resolution — higher = smoother cavity walls (print cost ↑ slightly).
const ROUND_SEGMENTS = 64
const SMOOTH_SEGMENTS = 48

/** @param {unknown} cs */
export function sectionIsEmpty(cs) {
  try {
    if (typeof cs.isEmpty === 'function') return cs.isEmpty()
    const b = cs.bounds()
    return !(b.max[0] > b.min[0] && b.max[1] > b.min[1])
  } catch {
    return false
  }
}

/** Area of a section in mm², or 0 if unavailable. */
export function sectionArea(cs) {
  try {
    return typeof cs.area === 'function' ? cs.area() : 0
  } catch {
    return 0
  }
}

/** @param {import('manifold-3d').Manifold} solid */
export function toPart(solid, kind, group, colorRgb, name) {
  const mesh = solid.getMesh()
  return {
    kind,
    group,
    colorRgb,
    name,
    numProp: mesh.numProp,
    vertProperties: new Float32Array(mesh.vertProperties),
    triVerts: new Uint32Array(mesh.triVerts)
  }
}

function resolveRgb(val, fallback = [128, 128, 128]) {
  if (Array.isArray(val) && val.length >= 3) return [val[0], val[1], val[2]]
  if (typeof val === 'string' && val.startsWith('#')) {
    const h = val.replace('#', '')
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return fallback
}

function normalizeParams(params = {}) {
  const keychain =
    params.keychain ??
    (params.keyringEnabled
      ? {
          enabled: true,
          holeDiameterMm: params.keyringHoleMm ?? 5.2,
          outerDiameterMm: params.keyringTabMm ?? 10,
          angleDeg: params.keyringAngleDeg ?? 270,
          offsetMm: params.keyringOffsetMm ?? 0
        }
      : null)

  return {
    imageMargin: params.imageMargin ?? params.imageMarginMm ?? 1.2,
    tolerance: params.tolerance ?? params.slipToleranceMm ?? 0.4,
    capWidthMm: params.capWidthMm ?? params.maxSizeMm ?? 35,
    baseShape: params.baseShape ?? 'outline',
    borderWidth: params.borderWidth ?? params.borderWidthMm ?? 2.6,
    topThickness: params.topThickness ?? params.topThicknessMm ?? 1.5,
    imageDepth: params.imageDepth ?? params.imageDepthMm ?? 0.8,
    travel: params.travel ?? params.travelMm ?? 4.0,
    capProud: params.capProud ?? params.capProudMm ?? 4.0,
    floorThickness: params.floorThickness ?? params.floorThicknessMm ?? 1.6,
    baseFilamentRgb: resolveRgb(params.baseFilamentRgb ?? params.colors?.lid ?? params.colors?.accent, [245, 166, 35]),
    bodyColorRgb: resolveRgb(params.bodyColorRgb ?? params.colors?.base, [45, 55, 72]),
    socketFitPct: params.socketFitPct ?? 0,
    stemFitPct: params.stemFitPct ?? 0,
    fitToleranceMm: Math.max(0, Math.min(0.8, Number(params.fitToleranceMm) || 0.15)),
    plateOpeningMm: Math.max(10, Number(params.plateOpeningMm) || 14),
    housingPocketMm: Math.max(12, Number(params.housingPocketMm) || 18.5),
    imageOffset: params.imageOffset ?? { x: 0, y: 0 },
    switches: params.switches,
    keychain,
    colorBleed: params.colorBleed ?? 0,
    outlineSmoothingRadius: params.outlineSmoothingRadius ?? 4.0,
    meshSolid: params.meshSolid ?? null,
    meshLidSolid: params.meshLidSolid ?? null,
    meshBaseSolid: params.meshBaseSolid ?? null,
    meshTransform: params.meshTransform ?? null,
    meshAsTop: params.meshAsTop ?? params.shapeMode === 'mesh',
    meshSplitLidRatio: Math.max(0, Math.min(0.75, Number(params.meshSplitLidRatio) || 0)),
    meshStemBuryMm: Math.max(0, Math.min(8, Number(params.meshStemBuryMm) || 0)),
    meshCavityToleranceMm: Math.max(
      0.05,
      Math.min(0.8, Number(params.meshCavityToleranceMm ?? params.fitToleranceMm ?? params.slipToleranceMm) || 0.2)
    ),
    meshSplitRegion: normalizeSplitRegion(params.meshSplitRegion)
  }
}

/** Wilayah potong XY sebagai fraksi AABB mesh (u/v pusat, wu/wv lebar/dalam). */
function normalizeSplitRegion(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const clamp01 = (v, d) => Math.max(0.02, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : d))
  const clampUV = (v, d) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : d))
  return {
    u: clampUV(r.u, 0.5),
    v: clampUV(r.v, 0.5),
    wu: clamp01(r.wu, 1),
    wv: clamp01(r.wv, 1)
  }
}

function placeTransformedMesh(solid, mt, track) {
  return track(
    solid
      .scale([mt.scaleX, mt.scaleY, mt.scaleZ])
      .translate([mt.translateX, mt.translateY, mt.translateZ])
  )
}

function cleanCutSection(cs, track, closeGap = 0.06) {
  try {
    let out = typeof cs.simplify === 'function' ? track(cs.simplify(0.035)) : cs
    if (!sectionIsEmpty(out) && closeGap > 0.001) {
      const closed = track(
        track(out.offset(closeGap, 'Round', 2.0, SMOOTH_SEGMENTS))
          .offset(-closeGap, 'Round', 2.0, SMOOTH_SEGMENTS)
      )
      if (!sectionIsEmpty(closed)) out = typeof closed.simplify === 'function' ? track(closed.simplify(0.03)) : closed
    }
    return out
  } catch {
    return cs
  }
}

function safeSliceSection(solid, z, track) {
  try {
    const sliced = cleanCutSection(track(solid.slice(z)), track)
    if (!sectionIsEmpty(sliced) && sectionArea(sliced) > 0.05) return sliced
  } catch {
    /* fall through to projection */
  }
  try {
    const projected = cleanCutSection(track(solid.project()), track, 0.04)
    if (!sectionIsEmpty(projected) && sectionArea(projected) > 0.05) return projected
  } catch {
    /* no usable fallback */
  }
  return null
}

function simplifySolid(solid, track, tolerance = 0.025) {
  try {
    return typeof solid.simplify === 'function' ? track(solid.simplify(tolerance)) : solid
  } catch {
    return solid
  }
}

/** Potong mesh di bidang Z — atas = lid, bawah = base (kasus hamburger). */
function splitSolidByZ(wasm, solid, cutZ, track, regionMm = null) {
  const { Manifold } = wasm
  const bb = solid.boundingBox()
  const pad = 10
  const fullW = Math.max(4, bb.max[0] - bb.min[0] + pad * 2)
  const fullD = Math.max(4, bb.max[1] - bb.min[1] + pad * 2)
  const fullCx = (bb.min[0] + bb.max[0]) / 2
  const fullCy = (bb.min[1] + bb.max[1]) / 2

  let work = solid
  let rest = null
  if (regionMm && regionMm.w > 0.5 && regionMm.d > 0.5) {
    const colH = Math.max(4, bb.max[2] - bb.min[2] + pad * 2)
    const midZ = (bb.min[2] + bb.max[2]) / 2
    const column = track(
      Manifold.cube([regionMm.w, regionMm.d, colH], true).translate([regionMm.cx, regionMm.cy, midZ])
    )
    work = track(solid.intersect(column))
    rest = track(solid.subtract(column))
    if (work.isEmpty()) {
      throw new Error('Wilayah potong kosong — perbesar resizer atau geser ke bagian mesh')
    }
  }

  const wbb = work.boundingBox()
  const cutSection = safeSliceSection(work, cutZ, track)
  if (!cutSection) {
    throw new Error('Bidang potong tidak menyentuh mesh — geser tinggi potong ke bagian yang berisi poligon')
  }
  const w = Math.max(4, (regionMm?.w || fullW) + pad * 2)
  const d = Math.max(4, (regionMm?.d || fullD) + pad * 2)
  const cx = regionMm?.cx ?? fullCx
  const cy = regionMm?.cy ?? fullCy

  const lidBottom = cutZ
  const lidTop = Math.max(wbb.max[2], bb.max[2]) + pad
  const lidH = Math.max(0.25, lidTop - lidBottom)
  const lidCube = track(Manifold.cube([w, d, lidH], true).translate([cx, cy, lidBottom + lidH / 2]))
  const lid = simplifySolid(track(work.intersect(lidCube)), track)

  const baseBottom = Math.min(wbb.min[2], bb.min[2]) - pad
  const baseTop = cutZ
  const baseH = Math.max(0.25, baseTop - baseBottom)
  const baseCube = track(Manifold.cube([w, d, baseH], true).translate([cx, cy, baseBottom + baseH / 2]))
  let base = simplifySolid(track(work.intersect(baseCube)), track)

  // Bagian di luar resizer tidak ikut terpotong — tetap di base utuh.
  if (rest && !rest.isEmpty()) {
    base = simplifySolid(track(base.add(rest)), track)
  }

  return { lid, base, cutSection, cutZ }
}

/**
 * @param {object} wasm — manifold-3d module with Manifold + CrossSection
 * @param {import('manifold-3d').Manifold} socket
 * @param {import('manifold-3d').Manifold} stem
 * @param {Array<{ rings: number[][][], filamentRgb?: number[], colorRgb?: number[], partName?: string }>} regions
 * @param {number[][][]} outline — normalized trace rings
 * @param {object} params
 */
export function buildClicker(wasm, socket, stem, regions, outline, params) {
  const p = normalizeParams(params)
  const { Manifold, CrossSection } = wasm
  const trash = []
  const track = (o) => {
    trash.push(o)
    return o
  }

  const simp = (s, eps = 0.04) => {
    try {
      return typeof s.simplify === 'function' ? track(s.simplify(eps)) : s
    } catch {
      return s
    }
  }

  const roundedRect = (w, h, r) => {
    const rr = Math.max(0.1, Math.min(r, Math.min(w, h) / 2 - 0.01))
    const core = track(
      CrossSection.square([Math.max(0.2, w - 2 * rr), Math.max(0.2, h - 2 * rr)], true)
    )
    return track(core.offset(rr, 'Round', 2.0, ROUND_SEGMENTS))
  }

  const grow = (sec, d) => (d <= 0.001 ? sec : track(sec.offset(d, 'Round', 2.0, ROUND_SEGMENTS)))

  const bridgeBetween = (a, b, width) => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const hw = width / 2
    return track(
      new CrossSection(
        [[
          [a[0] + nx * hw, a[1] + ny * hw],
          [b[0] + nx * hw, b[1] + ny * hw],
          [b[0] - nx * hw, b[1] - ny * hw],
          [a[0] - nx * hw, a[1] - ny * hw]
        ]],
        'NonZero'
      )
    )
  }

  const shrink = (sec, d, fb) => {
    if (d <= 0.01) return sec
    const r = track(sec.offset(-d, 'Round', 2.0, ROUND_SEGMENTS))
    return sectionIsEmpty(r) ? fb : r
  }

  const extrudeAt = (cs, h, z) => {
    if (sectionIsEmpty(cs)) {
      const dummy = track(track(Manifold.extrude(track(CrossSection.circle(0.1, 3)), 0.1)).translate([0, 0, z]))
      return track(dummy.subtract(dummy))
    }
    return track(track(Manifold.extrude(cs, Math.max(0.01, h))).translate([0, 0, z]))
  }

  // --- Socket fit ---
  const socketFit = p.socketFitPct ?? 0
  const fitTol = Math.max(0, p.fitToleranceMm || 0)
  const socketSized =
    Math.abs(socketFit) > 0.01 || fitTol > 0.001
      ? (() => {
          const bb0 = socket.boundingBox()
          const dim0 = Math.max(bb0.max[0] - bb0.min[0], bb0.max[1] - bb0.min[1], 1)
          // fitTolerance memperlebar lubang agar MX masuk longgar di mesh organik
          const xyScale = 1 + socketFit / 100 + (2 * fitTol) / dim0
          return track(socket.scale([xyScale, xyScale, 1]))
        })()
      : socket

  const socketBB = socketSized.boundingBox()
  const stemBB = stem.boundingBox()
  const socketDim = Math.max(socketBB.max[0] - socketBB.min[0], socketBB.max[1] - socketBB.min[1])
  const plateOpening = Math.max(socketDim * 0.85, (p.plateOpeningMm || 14) + 2 * fitTol)
  const housingPocket = Math.max(socketDim + 0.4, (p.housingPocketMm || 18.5) + 2 * fitTol)

  // --- Normalized image bbox ---
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of outline) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (!isFinite(minX)) {
    minX = -0.5
    maxX = 0.5
    minY = -0.5
    maxY = 0.5
  }
  const nW = maxX - minX || 1
  const nH = maxY - minY || 1

  const border = Math.max(0, p.imageMargin)
  const tol = Math.max(0.05, p.tolerance)
  const switchClear = socketDim + 3.0
  const minCap = switchClear + 1.0
  const isOutline = p.baseShape === 'outline'
  const warnings = []

  let imageScale = Math.max(2, p.capWidthMm - 2 * border)
  let imgW = nW * imageScale
  let imgH = nH * imageScale
  if (isOutline && Math.min(imgW, imgH) + 2 * border < minCap) {
    imageScale *= (minCap - 2 * border) / Math.min(imgW, imgH)
    imgW = nW * imageScale
    imgH = nH * imageScale
    const actual = Math.max(imgW, imgH) + 2 * border
    warnings.push(
      `Your design is too narrow for the switch, so it was scaled up to ${actual.toFixed(0)} mm `
        + `instead of ${p.capWidthMm.toFixed(0)} mm. Switch Base style to Shape to keep the size you set.`
    )
  }
  const sR = imageScale

  const scaleRings = (rings) => rings.map((r) => r.map(([x, y]) => [x * sR, y * sR]))

  const offX = isOutline ? 0 : (p.imageOffset?.x ?? 0)
  const offY = isOutline ? 0 : (p.imageOffset?.y ?? 0)
  const placeRings = (rings) =>
    offX === 0 && offY === 0
      ? scaleRings(rings)
      : rings.map((r) => r.map(([x, y]) => [x * sR + offX, y * sR + offY]))

  const getRingArea = (ring) => {
    let area = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    }
    return Math.abs(area / 2)
  }

  const removeHoles = (cs) => {
    if (sectionIsEmpty(cs)) return cs
    const rect = track(CrossSection.square([1000, 1000], true))
    const inverted = track(rect.subtract(cs))
    const islands = [...inverted.decompose()]
    if (islands.length <= 1) return cs
    let maxArea = -1
    let outerSpace = islands[0]
    for (let i = 0; i < islands.length; i++) {
      const area = islands[i].area()
      if (area > maxArea) {
        maxArea = area
        outerSpace = islands[i]
      }
    }
    return track(rect.subtract(outerSpace))
  }

  const filledOutline = () => {
    const validRings = scaleRings(outline).filter((r) => r.length >= 3 && getRingArea(r) > 0.001)
    if (validRings.length === 0) {
      return track(CrossSection.square([sR, sR], true))
    }
    return simp(track(new CrossSection(validRings, 'NonZero')), 0.03)
  }

  const makeHexagon = (r) => {
    const pts = []
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6
      pts.push([Math.cos(angle) * r, Math.sin(angle) * r])
    }
    return track(new CrossSection([pts], 'NonZero'))
  }

  const makeStar = (r, points = 5) => {
    const innerR = r * 0.56
    const pts = []
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI / points) * i - Math.PI / 2
      const radius = i % 2 === 0 ? r : innerR
      pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    const sharp = track(new CrossSection([pts], 'NonZero'))
    const rr = r * 0.13
    const a = track(sharp.offset(-rr, 'Round', 2.0, 64))
    const b = track(a.offset(2 * rr, 'Round', 2.0, 64))
    return track(b.offset(-rr, 'Round', 2.0, 64))
  }

  const makeHeart = (r) => {
    const h = 1 / Math.SQRT2
    const lobeR = 0.5
    const lobeX = h / 2
    const lobeY = 1.5 * h
    const maxX = lobeX + lobeR
    const cy = (lobeY + lobeR) / 2
    const scale = r / Math.max(maxX, cy)
    const seg = 128
    const circleRing = (ox) => {
      const ring = []
      for (let i = 0; i < seg; i++) {
        const a = (Math.PI * 2 * i) / seg
        ring.push([(ox + lobeR * Math.cos(a)) * scale, (lobeY - cy + lobeR * Math.sin(a)) * scale])
      }
      return ring
    }
    const diamondRing = [
      [0, (0 - cy) * scale],
      [h * scale, (h - cy) * scale],
      [0, (2 * h - cy) * scale],
      [-h * scale, (h - cy) * scale]
    ]
    const diamond = track(new CrossSection([diamondRing], 'NonZero'))
    const lobeL = track(new CrossSection([circleRing(-lobeX)], 'NonZero'))
    const lobeR2 = track(new CrossSection([circleRing(lobeX)], 'NonZero'))
    return track(track(diamond.add(lobeL)).add(lobeR2))
  }

  const makeEgg = (r) => {
    const steps = 96
    const width = 0.74
    const taper = 0.26
    const raw = []
    for (let i = 0; i < steps; i++) {
      const t = (Math.PI * 2 * i) / steps
      const y = r * Math.sin(t)
      const x = r * width * Math.cos(t) * (1 - taper * Math.sin(t))
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
    const pts = raw.map(([x, y]) => [x - cx, y - cy])
    return track(new CrossSection([pts], 'NonZero'))
  }

  // --- Cap plate footprint ---
  let plate
  if (p.baseShape === 'outline') {
    const rawPlate = track(filledOutline().offset(border, 'Round', 2.0, ROUND_SEGMENTS))
    const solidPlate = removeHoles(rawPlate)
    const smoothingRadius = Math.max(0, p.outlineSmoothingRadius)
    plate = simp(
      smoothingRadius > 0.01
        ? track(
            solidPlate
              .offset(smoothingRadius, 'Round', 2.0, SMOOTH_SEGMENTS)
              .offset(-smoothingRadius, 'Round', 2.0, SMOOTH_SEGMENTS)
          )
        : solidPlate,
      0.05
    )
  } else {
    const rectAspect = Math.min(3, Math.max(0.34, imgH > 0.01 ? imgW / imgH : 1))
    const genShape = (rr) => {
      switch (p.baseShape) {
        case 'square':
          return roundedRect(2 * rr, 2 * rr, 2 * rr * 0.22)
        case 'rect':
          return roundedRect(2 * rr * rectAspect, 2 * rr, 2 * rr * 0.22)
        case 'hexagon':
          return makeHexagon(rr)
        case 'heart':
          return makeHeart(rr)
        case 'star':
          return makeStar(rr)
        case 'egg':
          return makeEgg(rr)
        case 'circle':
        default:
          return track(CrossSection.circle(rr, 160))
      }
    }
    const halfW = Math.max(imgW / 2 + border, minCap / 2)
    const halfH = Math.max(imgH / 2 + border, minCap / 2)
    const unit = genShape(1)
    const fits = (k) => {
      const rect = track(
        track(CrossSection.square([(2 * halfW) / k, (2 * halfH) / k], true)).translate([offX / k, offY / k])
      )
      const outside = track(rect.subtract(unit))
      return sectionIsEmpty(outside)
    }
    let hi = Math.max(1, Math.hypot(halfW, halfH))
    for (let i = 0; i < 40 && !fits(hi); i++) hi *= 2
    let lo = 1e-3
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) hi = mid
      else lo = mid
    }
    plate = genShape(hi)
  }

  const imageArea = shrink(plate, border, plate)

  // --- Switch placement ---
  const plateBB = plate.bounds()
  const halfCol = switchClear / 2
  const loX = plateBB.min[0] + halfCol
  const hiX = plateBB.max[0] - halfCol
  const loY = plateBB.min[1] + halfCol
  const hiY = plateBB.max[1] - halfCol
  const clampAxis = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))
  const clampX = (v) => clampAxis(v, loX, hiX)
  const clampY = (v) => clampAxis(v, loY, hiY)

  const requested = (p.switches?.length ? p.switches : [{ x: 0, y: 0, rotation: 0 }]).slice(0, 16)
  const applied = requested.map((sw) => ({
    x: clampX(sw.x ?? 0),
    y: clampY(sw.y ?? 0),
    rotation: sw.rotation ?? 0
  }))

  const SWITCH_PITCH_MIN = socketDim + 2.0
  let pinched = false
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < applied.length; i++) {
      for (let j = i + 1; j < applied.length; j++) {
        const a = applied[i]
        const b = applied[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (Math.hypot(dx, dy) < SWITCH_PITCH_MIN) {
          pinched = true
          if (Math.abs(dx) >= Math.abs(dy)) {
            b.x = clampX(a.x + (dx < 0 ? -1 : 1) * SWITCH_PITCH_MIN)
          } else {
            b.y = clampY(a.y + (dy < 0 ? -1 : 1) * SWITCH_PITCH_MIN)
          }
        }
      }
    }
  }
  if (pinched && requested.length > 1) {
    warnings.push('Switches were pulled together to fit the cap. Increase Size for more room.')
  }

  // --- Stem fit ---
  let stemSized = stem
  const stemFit = p.stemFitPct ?? 0
  if (Math.abs(stemFit) > 0.01) {
    const f = 1 + stemFit / 100
    const scaled = track(stem.scale([f, f, 1]))
    stemSized = track(f > 1 ? scaled.intersect(stem) : scaled.add(stem))
  }

  const placeSolidAt = (s, sw) => {
    const r = Math.abs(sw.rotation) > 0.001 ? track(s.rotate([0, 0, sw.rotation])) : s
    return Math.abs(sw.x) > 0.001 || Math.abs(sw.y) > 0.001 ? track(r.translate([sw.x, sw.y, 0])) : r
  }
  const socketAts = applied.map((sw) => placeSolidAt(socketSized, sw))
  const stemAts = applied.map((sw) => placeSolidAt(stemSized, sw))

  // --- Well / body footprints ---
  const socketColumnBase = roundedRect(switchClear, switchClear, 2.5)
  const capFp = grow(plate, tol)
  let wellFp = capFp
  for (const sw of applied) {
    const col = track(
      (Math.abs(sw.rotation) > 0.001 ? track(socketColumnBase.rotate(sw.rotation)) : socketColumnBase).translate([
        sw.x,
        sw.y
      ])
    )
    wellFp = track(wellFp.add(col))
  }

  const bulgeArea = sectionArea(track(wellFp.subtract(capFp)))
  if (bulgeArea > 2) {
    warnings.push(
      'The base was widened to clear the switch. Increase Size, or move the switch, to keep the base the shape of your design.'
    )
  }

  const wellFootprint = simp(wellFp)
  const borderW = Math.max(0.4, p.borderWidth)
  const bodyFootprint = simp(grow(wellFootprint, borderW))

  // --- Z layout (Z = 0 switch-plate top) ---
  const cavityFloorZ = socketBB.max[2]
  const slabBottomZ = stemBB.max[2]
  const backing = Math.max(0.8, p.topThickness)
  const imageDepth = Math.max(0.2, p.imageDepth)
  const slabTopZ = slabBottomZ + backing + imageDepth
  const imageBottomZ = slabBottomZ + backing
  const travel = Math.max(0, p.travel)

  const bodyBottomZ = socketBB.min[2] - p.floorThickness
  const maxProud = Math.max(0.4, slabTopZ - cavityFloorZ - 1.0)
  const capProud = Math.max(0.4, Math.min(p.capProud, maxProud))
  const bodyTopZ = slabTopZ - capProud
  const wellFloorZ = Math.min(cavityFloorZ, slabBottomZ - travel)

  const skirtThickness = 1.4
  const skirtBottomZ = stemBB.min[2]
  const skirtLen = slabBottomZ - skirtBottomZ

  const parts = []
  const useDualMesh = Boolean(p.meshLidSolid && p.meshBaseSolid && p.meshTransform)
  const useMeshSplit =
    !useDualMesh && Boolean(p.meshSolid && p.meshTransform && p.meshSplitLidRatio > 0.05)
  const useMeshAsTop = Boolean(p.meshSolid && p.meshTransform && p.meshAsTop && !useMeshSplit && !useDualMesh)

  let splitLidSolid = null
  let splitBaseSolid = null
  let splitCutSection = null
  if (useDualMesh) {
    const mt = p.meshTransform
    splitLidSolid = placeTransformedMesh(p.meshLidSolid, mt, track)
    splitBaseSolid = placeTransformedMesh(p.meshBaseSolid, mt, track)
    const lbb = splitLidSolid.boundingBox()
    const bbb = splitBaseSolid.boundingBox()
    // Samakan Z: dasar potongan lid duduk di slabBottomZ
    const lidMinZ = lbb.min[2]
    const baseMaxZ = bbb.max[2]
    splitLidSolid = track(splitLidSolid.translate([0, 0, slabBottomZ - lidMinZ]))
    splitBaseSolid = track(splitBaseSolid.translate([0, 0, slabBottomZ - baseMaxZ]))
    splitCutSection = safeSliceSection(splitBaseSolid, slabBottomZ, track) || safeSliceSection(splitLidSolid, slabBottomZ, track)
  } else if (useMeshSplit) {
    const mt = p.meshTransform
    const placed = placeTransformedMesh(p.meshSolid, mt, track)
    const pbb = placed.boundingBox()
    const meshH = Math.max(0.5, pbb.max[2] - pbb.min[2])
    const cutZ = pbb.max[2] - meshH * p.meshSplitLidRatio
    const mw = Math.max(0.5, pbb.max[0] - pbb.min[0])
    const md = Math.max(0.5, pbb.max[1] - pbb.min[1])
    const reg = p.meshSplitRegion
    const useRegion = reg.wu < 0.995 || reg.wv < 0.995 || Math.abs(reg.u - 0.5) > 0.01 || Math.abs(reg.v - 0.5) > 0.01
    const regionMm = useRegion
      ? {
          cx: pbb.min[0] + mw * reg.u,
          cy: pbb.min[1] + md * reg.v,
          w: Math.max(1, mw * reg.wu),
          d: Math.max(1, md * reg.wv)
        }
      : null
    const split = splitSolidByZ(wasm, placed, cutZ, track, regionMm)
    if (split.lid.isEmpty() || split.base.isEmpty()) {
      throw new Error('Split mesh gagal — naik/turunkan rasio lid, perbesar wilayah potong, atau cek orientasi (Z ke atas)')
    }
    const dz = slabBottomZ - cutZ
    splitLidSolid = track(split.lid.translate([0, 0, dz]))
    splitBaseSolid = track(split.base.translate([0, 0, dz]))
    splitCutSection = split.cutSection
    const baseH = Math.max(0.1, splitBaseSolid.boundingBox().max[2] - splitBaseSolid.boundingBox().min[2])
    if (baseH < Math.abs(socketBB.min[2]) + p.floorThickness + 1) {
      warnings.push(
        'Bagian bawah mesh tipis untuk socket. Perbesar tinggi mesh, turunkan rasio lid, atau naikkan Ukuran maks.'
      )
    }
  }

  // --- Top / cap ---
  let base = null
  const meshStemPocket =
    useMeshSplit || useDualMesh || useMeshAsTop
      ? Math.max(0.8, Math.min(6, p.meshStemBuryMm || 2.5))
      : 0

  if ((useMeshSplit || useDualMesh) && splitLidSolid) {
    // Lid mesh: stem ditenggelamkan ke dalam (bukan pad di luar).
    base = splitLidSolid
    if (splitCutSection && !sectionIsEmpty(splitCutSection)) {
      const seatThickness = Math.max(0.35, Math.min(0.75, backing * 0.45))
      const seat = extrudeAt(splitCutSection, seatThickness, slabBottomZ - seatThickness)
      base = simplifySolid(track(base.add(seat)), track)
    }
  } else if (useMeshAsTop) {
    const mt = p.meshTransform
    base = track(
      p.meshSolid
        .scale([mt.scaleX, mt.scaleY, mt.scaleZ])
        .translate([mt.translateX, mt.translateY, slabBottomZ + mt.translateZ])
    )
  } else {
    const cap = extrudeAt(plate, backing + imageDepth, slabBottomZ)
    base = cap
  }

  // Simplified inlay: skip multicolor carving; optional single-region extrude
  if (!useMeshAsTop && !useMeshSplit && !useDualMesh && regions.length === 1) {
    const r = regions[0]
    const validRings = placeRings(r.rings || []).filter((ring) => ring.length >= 3 && getRingArea(ring) > 0.001)
    if (validRings.length > 0) {
      let cs = simp(track(new CrossSection(validRings, 'NonZero')), 0.03)
      if (p.colorBleed > 0.001) cs = grow(cs, p.colorBleed)
      const clipped = track(cs.intersect(imageArea))
      if (!sectionIsEmpty(clipped)) {
        const inlay = extrudeAt(clipped, imageDepth, imageBottomZ)
        if (!inlay.isEmpty()) {
          const rgb = resolveRgb(r.filamentRgb ?? r.colorRgb, [200, 200, 200])
          parts.push(toPart(inlay, 'cap', 'top', rgb, r.partName ?? 'inlay'))
          const holePrism = extrudeAt(clipped, slabTopZ - imageBottomZ + 0.02, imageBottomZ - 0.01)
          base = track(base.subtract(holePrism))
        }
      }
    }
  }

  if (!useMeshAsTop && !useMeshSplit && !useDualMesh && p.meshSolid && p.meshTransform) {
    const mt = p.meshTransform
    const relief = track(
      p.meshSolid
        .scale([mt.scaleX, mt.scaleY, mt.scaleZ])
        .translate([mt.translateX, mt.translateY, slabTopZ + mt.translateZ])
    )
    if (!relief.isEmpty()) base = track(base.add(relief))
  }

  if (meshStemPocket > 0.01) {
    // Stem hanya overlap tipis ke underside lid. Pocket/boss dibuat turun, supaya tidak merusak wajah mesh.
    const stemJoinOverlap = Math.min(0.18, meshStemPocket * 0.08)
    for (const st of stemAts) {
      base = track(base.add(track(st.translate([0, 0, stemJoinOverlap]))))
    }
    const bossSize = Math.max(
      7,
      stemBB.max[0] - stemBB.min[0] + 1.6,
      stemBB.max[1] - stemBB.min[1] + 1.6
    )
    const bossH = meshStemPocket
    for (const sw of applied) {
      const bossSection = track(roundedRect(bossSize, bossSize, 1.2).translate([sw.x, sw.y]))
      const boss = extrudeAt(bossSection, bossH + stemJoinOverlap, slabBottomZ - bossH)
      base = track(base.add(boss))
    }
  } else {
    for (const st of stemAts) base = track(base.add(st))
  }

  if (!useMeshAsTop && !useMeshSplit && !useDualMesh && skirtLen > 0.4) {
    const stemGuard = 12 + 2 * skirtThickness
    let skirtBasePlate = plate
    for (const sw of applied) {
      const stemGuardCs = track(track(CrossSection.square([stemGuard, stemGuard], true)).translate([sw.x, sw.y]))
      skirtBasePlate = track(skirtBasePlate.add(stemGuardCs))
    }
    const skirtInner = track(skirtBasePlate.offset(-skirtThickness, 'Miter', 2.0))
    if (!sectionIsEmpty(skirtInner)) {
      const skirtRing = track(skirtBasePlate.subtract(skirtInner))
      const skirt = extrudeAt(skirtRing, skirtLen + 0.3, skirtBottomZ)
      base = track(base.add(skirt))
      const skirtExtension = track(skirtBasePlate.subtract(plate))
      if (!sectionIsEmpty(skirtExtension)) {
        const capFill = extrudeAt(skirtExtension, slabTopZ - skirtBottomZ, skirtBottomZ)
        base = track(base.add(capFill))
        if (sectionArea(skirtExtension) > 2) {
          warnings.push(
            'The top was widened around the switch, so a plain patch shows on the design. Increase Size, or move the switch, to clear it.'
          )
        }
      }
    }
  }

  parts.unshift(toPart(base, 'cap', 'top', p.baseFilamentRgb, 'top-base'))

  // --- Body: mesh bawah (split/dual) atau solid − well − socket ---
  const useMeshBody = (useMeshSplit || useDualMesh) && splitBaseSolid
  const meshBodyTopZ = useMeshBody ? splitBaseSolid.boundingBox().max[2] : bodyTopZ
  const meshWellFloorZ = useMeshBody
    ? Math.min(cavityFloorZ, slabBottomZ - Math.max(travel, 1.2))
    : wellFloorZ
  const bodyBlock = useMeshBody
    ? splitBaseSolid
    : extrudeAt(bodyFootprint, bodyTopZ - bodyBottomZ, bodyBottomZ)
  let bodyCavityFootprint = wellFootprint
  if (useMeshBody) {
    let seatSection = splitCutSection && !sectionIsEmpty(splitCutSection)
      ? grow(splitCutSection, Math.max(0.12, p.meshCavityToleranceMm))
      : null
    if (!seatSection || sectionIsEmpty(seatSection)) {
      const projected = safeSliceSection(splitLidSolid, slabBottomZ, track)
      seatSection = projected && !sectionIsEmpty(projected)
        ? grow(projected, Math.max(0.12, p.meshCavityToleranceMm))
        : wellFootprint
    }
    const stemGuard = Math.max(12, stemBB.max[0] - stemBB.min[0] + 2.8, stemBB.max[1] - stemBB.min[1] + 2.8)
    for (const sw of applied) {
      const guard = track(roundedRect(stemGuard, stemGuard, 1.8).translate([sw.x, sw.y]))
      seatSection = track(seatSection.add(guard))
    }
    bodyCavityFootprint = simp(seatSection, 0.04)
  }
  const well = extrudeAt(bodyCavityFootprint, meshBodyTopZ - meshWellFloorZ + 1, meshWellFloorZ)
  let body = bodyBlock

  if (useMeshBody) {
    const bb = splitBaseSolid.boundingBox()
    const needMinZ = bodyBottomZ
    if (bb.min[2] > needMinZ + 0.15) {
      // Lantai penuh di bawah pot agar kedalaman socket MX (≈11.5mm) muat
      const padW = Math.max(bb.max[0] - bb.min[0], housingPocket) + 6
      const padD = Math.max(bb.max[1] - bb.min[1], housingPocket) + 6
      const padCx = (bb.min[0] + bb.max[0]) / 2
      const padCy = (bb.min[1] + bb.max[1]) / 2
      const padFoot = track(track(CrossSection.square([padW, padD], true)).translate([padCx, padCy]))
      const floorPad = extrudeAt(padFoot, bb.min[2] - needMinZ + 0.15, needMinZ)
      body = track(body.add(floorPad))
      warnings.push('Ditambah lantai di bawah mesh agar socket MX muat penuh.')
    }
    // Dek switch datar di Z=0 agar plate cutout rapi
    for (const sw of applied) {
      const deck = track(roundedRect(housingPocket + 3, housingPocket + 3, 2).translate([sw.x, sw.y]))
      const deckH = 0.7
      const deckSolid = extrudeAt(deck, deckH, cavityFloorZ - deckH)
      body = track(body.add(deckSolid))
    }
  }

  // Simplified keychain loop
  const kc = p.keychain
  if (kc && kc.enabled) {
    const holeR = Math.max(1.5, (kc.holeDiameterMm ?? 5.2) / 2)
    const th = Math.max(2.5, Math.min(4.0, (meshBodyTopZ - bodyBottomZ) * 0.35))
    const zb = meshBodyTopZ - th
    const { p: edgeP, dir } = edgePointAt(bodyFootprint, kc.angleDeg ?? 270)
    const tangent = [-dir[1], dir[0]]
    const px = edgeP[0] + tangent[0] * (kc.offsetMm ?? 0)
    const py = edgeP[1] + tangent[1] * (kc.offsetMm ?? 0)

    const loopR = Math.max(3.2, holeR + 1.8, (kc.outerDiameterMm ?? 10) / 2)
    const overlap = Math.min(loopR * 0.42, Math.max(1.1, loopR - holeR - 0.2))
    const hcx = px + dir[0] * (loopR - overlap)
    const hcy = py + dir[1] * (loopR - overlap)
    const innerP = [px - dir[0] * overlap, py - dir[1] * overlap]
    const outerP = [hcx + dir[0] * loopR * 0.18, hcy + dir[1] * loopR * 0.18]
    const loopCircle = track(track(CrossSection.circle(loopR, 80)).translate([hcx, hcy]))
    const loopBridge = bridgeBetween(innerP, outerP, Math.max(holeR * 2.15, loopR * 0.9))
    const loopFootprint = track(loopCircle.add(loopBridge))

    const loop = extrudeAt(loopFootprint, th, zb)
    body = track(body.add(loop))

    const hole = extrudeAt(track(track(CrossSection.circle(holeR, 48)).translate([hcx, hcy])), th + 2, zb - 1)
    body = track(body.subtract(hole))
  }

  body = track(body.subtract(well))

  // Mesh base: lubang MX eksplisit (plate + housing + socket) — boolean socket saja sering
  // tidak bersih / tidak pas ukuran pada pot organik.
  if (useMeshBody) {
    const plateCutBase = roundedRect(plateOpening, plateOpening, Math.min(1.2, plateOpening * 0.08))
    const housingCutBase = roundedRect(housingPocket, housingPocket, Math.min(2.2, housingPocket * 0.12))
    const wellTop = meshBodyTopZ + 0.6
    const plateBottom = cavityFloorZ - 0.35
    const housingTop = cavityFloorZ + 0.25
    for (const sw of applied) {
      const plateCs = track(
        (Math.abs(sw.rotation) > 0.001 ? track(plateCutBase.rotate(sw.rotation)) : plateCutBase).translate([
          sw.x,
          sw.y
        ])
      )
      const housingCs = track(
        (Math.abs(sw.rotation) > 0.001 ? track(housingCutBase.rotate(sw.rotation)) : housingCutBase).translate([
          sw.x,
          sw.y
        ])
      )
      // Plate cutout: dari lantai well menembus atas (lid seat)
      const plateH = Math.max(0.5, wellTop - plateBottom)
      body = track(body.subtract(extrudeAt(plateCs, plateH, plateBottom)))
      // Housing pocket: ruang badan switch di bawah plate
      const houseH = Math.max(0.5, housingTop - bodyBottomZ)
      body = track(body.subtract(extrudeAt(housingCs, houseH, bodyBottomZ)))
    }
  }

  for (const sk of socketAts) body = track(body.subtract(sk))

  if (!body.isEmpty()) {
    parts.push(toPart(body, 'body', 'base', p.bodyColorRgb, 'base-body'))
  }

  for (const o of trash) {
    try {
      o.delete()
    } catch {
      /* already freed */
    }
  }

  return { parts, switchPlacements: applied, warnings }
}

function raySegT(ox, oy, dx, dy, a, b) {
  const ex = b[0] - a[0]
  const ey = b[1] - a[1]
  const det = -dx * ey + ex * dy
  if (Math.abs(det) < 1e-12) return null
  const r0x = a[0] - ox
  const r0y = a[1] - oy
  const t = (-r0x * ey + ex * r0y) / det
  const u = (dx * r0y - dy * r0x) / det
  if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9) return t
  return null
}

function edgePointAt(footprint, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  const dir = [Math.sin(rad), Math.cos(rad)]
  let rings = []
  try {
    rings = footprint.toPolygons()
  } catch {
    rings = []
  }
  let area = 0
  let cx = 0
  let cy = 0
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
      area += cross
      cx += (ring[j][0] + ring[i][0]) * cross
      cy += (ring[j][1] + ring[i][1]) * cross
    }
  }
  let ox
  let oy
  if (Math.abs(area) > 1e-6) {
    area *= 0.5
    ox = cx / (6 * area)
    oy = cy / (6 * area)
  } else {
    const b = footprint.bounds()
    ox = (b.min[0] + b.max[0]) / 2
    oy = (b.min[1] + b.max[1]) / 2
  }
  let bestT = -Infinity
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const t = raySegT(ox, oy, dir[0], dir[1], ring[j], ring[i])
      if (t !== null && t > bestT) bestT = t
    }
  }
  if (!isFinite(bestT) || bestT <= 0) {
    const b = footprint.bounds()
    bestT = Math.max((b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2)
  }
  return { p: [ox + dir[0] * bestT, oy + dir[1] * bestT], dir }
}
