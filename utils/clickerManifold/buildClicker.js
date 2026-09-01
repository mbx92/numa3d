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
          angleDeg: params.keyringAngleDeg ?? 90,
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
    imageOffset: params.imageOffset ?? { x: 0, y: 0 },
    switches: params.switches,
    keychain,
    colorBleed: params.colorBleed ?? 0
  }
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
  const socketSized =
    Math.abs(socketFit) > 0.01
      ? track(socket.scale([1 + socketFit / 100, 1 + socketFit / 100, 1]))
      : socket

  const socketBB = socketSized.boundingBox()
  const stemBB = stem.boundingBox()
  const socketDim = Math.max(socketBB.max[0] - socketBB.min[0], socketBB.max[1] - socketBB.min[1])

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
    const smoothingRadius = 4.0
    plate = simp(
      track(
        solidPlate
          .offset(smoothingRadius, 'Round', 2.0, SMOOTH_SEGMENTS)
          .offset(-smoothingRadius, 'Round', 2.0, SMOOTH_SEGMENTS)
      ),
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

  const requested = (p.switches?.length ? p.switches : [{ x: 0, y: 0, rotation: 0 }]).slice(0, 3)
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

  // --- Cap plate ---
  const cap = extrudeAt(plate, backing + imageDepth, slabBottomZ)

  // Simplified inlay: skip multicolor carving; optional single-region extrude
  let base = cap
  if (regions.length === 1) {
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

  for (const st of stemAts) base = track(base.add(st))

  if (skirtLen > 0.4) {
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

  // --- Body: solid − well − socket ---
  const bodyBlock = extrudeAt(bodyFootprint, bodyTopZ - bodyBottomZ, bodyBottomZ)
  const well = extrudeAt(wellFootprint, bodyTopZ - wellFloorZ + 1, wellFloorZ)
  let body = bodyBlock

  // Simplified keychain loop
  const kc = p.keychain
  if (kc && kc.enabled) {
    const holeR = Math.max(1.5, (kc.holeDiameterMm ?? 5.2) / 2)
    const th = Math.max(2.5, Math.min(4.0, (bodyTopZ - bodyBottomZ) * 0.35))
    const zb = bodyBottomZ
    const { p: edgeP, dir } = edgePointAt(bodyFootprint, kc.angleDeg ?? 90)
    const tangent = [-dir[1], dir[0]]
    const px = edgeP[0] + tangent[0] * (kc.offsetMm ?? 0)
    const py = edgeP[1] + tangent[1] * (kc.offsetMm ?? 0)

    const loopR = Math.max(3.2, holeR + 1.8)
    const outward = loopR
    const localLoop = track(track(CrossSection.circle(loopR, 64)).translate([0, outward]))
    const bridgeH = outward + loopR * 3.5
    const localBridge = track(
      track(CrossSection.square([loopR * 2, bridgeH], true)).translate([0, outward - bridgeH / 2])
    )
    let localFp = track(localLoop.add(localBridge))
    const rotDeg = (kc.angleDeg ?? 90) - 90
    if (Math.abs(rotDeg) > 0.001) localFp = track(localFp.rotate(rotDeg))
    const loopFootprint = track(localFp.translate([px, py]))

    const loop = extrudeAt(loopFootprint, th, zb)
    body = track(body.add(loop))

    const rr = (rotDeg * Math.PI) / 180
    const hcx = -outward * Math.sin(rr) + px
    const hcy = outward * Math.cos(rr) + py
    const hole = extrudeAt(track(track(CrossSection.circle(holeR, 48)).translate([hcx, hcy])), th + 2, zb - 1)
    body = track(body.subtract(hole))
  }

  body = track(body.subtract(well))
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
  const dir = [Math.cos(rad), Math.sin(rad)]
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
