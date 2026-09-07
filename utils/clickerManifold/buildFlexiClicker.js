import { buildClicker, toPart } from './buildClicker.js'

const HINGE_SEGMENTS = 56

function partToSolid(wasm, part) {
  const mesh = new wasm.Mesh({
    numProp: part.numProp || 3,
    vertProperties: part.vertProperties,
    triVerts: part.triVerts
  })
  mesh.merge()
  return wasm.Manifold.ofMesh(mesh)
}

function translatePart(part, dx, dy, dz = 0, nameSuffix = '') {
  const vp = new Float32Array(part.vertProperties)
  const np = part.numProp || 3
  for (let i = 0; i < vp.length; i += np) {
    vp[i] += dx
    vp[i + 1] += dy
    vp[i + 2] += dz
  }
  return {
    ...part,
    name: nameSuffix ? `${part.name || part.kind}-${nameSuffix}` : part.name,
    vertProperties: vp
  }
}

function addAll(track, first, solids) {
  let out = first
  for (const solid of solids) out = track(out.add(solid))
  return out
}

function makeBox(wasm, track, x0, x1, y, width, z0, z1) {
  const len = Math.max(0.05, x1 - x0)
  return track(
    wasm.Manifold
      .cube([len, width, Math.max(0.05, z1 - z0)], true)
      .translate([(x0 + x1) / 2, y, (z0 + z1) / 2])
  )
}

function makeCylinder(wasm, track, height, radius, x, y, z) {
  return track(wasm.Manifold.cylinder(height, radius, radius, HINGE_SEGMENTS).translate([x, y, z]))
}

function makeXCylinder(wasm, track, length, radius, x, y, z) {
  return track(
    wasm.Manifold
      .cylinder(length, radius, radius, HINGE_SEGMENTS)
      .rotate([0, 90, 0])
      .translate([x, y, z])
  )
}

function makeRing(wasm, track, height, outerR, innerR, x, y, z) {
  const outer = makeCylinder(wasm, track, height, outerR, x, y, z)
  const inner = makeCylinder(wasm, track, height + 0.4, innerR, x, y, z - 0.2)
  return track(outer.subtract(inner))
}

function addStrapTunnel(wasm, track, solid, bounds, holeDiameter) {
  const holeR = Math.max(1.25, Math.min(2.5, holeDiameter / 2))
  const y = (bounds.min[1] + bounds.max[1]) / 2
  const zTarget = bounds.min[2] + holeR + 0.65
  const zMax = bounds.max[2] - holeR - 0.6
  const z = Math.max(bounds.min[2] + holeR + 0.25, Math.min(zMax, zTarget))
  const length = bounds.max[0] - bounds.min[0] + 2
  const tunnel = makeXCylinder(wasm, track, length, holeR, bounds.min[0] - 1, y, z)
  return track(solid.subtract(tunnel))
}

function addHingePair(wasm, track, leftSolid, rightSolid, leftBounds, rightBounds, clearance) {
  const bodyGap = Math.max(0.1, rightBounds.min[0] - leftBounds.max[0])
  const hingeX = (leftBounds.max[0] + rightBounds.min[0]) / 2
  const hingeY = ((leftBounds.min[1] + leftBounds.max[1]) + (rightBounds.min[1] + rightBounds.max[1])) / 4
  const outerR = Math.min(3.35, Math.max(2.8, bodyGap * 0.38))
  const pinR = 1.15
  const boreR = pinR + clearance
  const armWidth = Math.max(4.2, outerR * 1.35)
  const armOverlap = 2.4

  const zMin = Math.max(leftBounds.min[2], rightBounds.min[2])
  const zMax = Math.min(leftBounds.max[2], rightBounds.max[2])
  const availableH = Math.max(8, zMax - zMin - 2.2)
  const totalH = Math.min(12, availableH)
  const z0 = zMin + Math.max(1, (zMax - zMin - totalH) / 2)
  const vGap = Math.max(0.32, clearance)
  const endH = Math.max(1.5, totalH * 0.26)
  const midZ0 = z0 + endH + vGap
  const midH = Math.max(2.4, totalH - endH * 2 - vGap * 2)
  const topZ0 = midZ0 + midH + vGap
  const topH = Math.max(1.2, z0 + totalH - topZ0)

  const pin = makeCylinder(wasm, track, totalH, pinR, hingeX, hingeY, z0)
  const bottomKnuckle = makeCylinder(wasm, track, endH, outerR, hingeX, hingeY, z0)
  const topKnuckle = makeCylinder(wasm, track, topH, outerR, hingeX, hingeY, topZ0)
  const leftBottomArm = makeBox(
    wasm,
    track,
    leftBounds.max[0] - armOverlap,
    hingeX + outerR * 0.8,
    hingeY,
    armWidth,
    z0,
    z0 + endH
  )
  const leftTopArm = makeBox(
    wasm,
    track,
    leftBounds.max[0] - armOverlap,
    hingeX + outerR * 0.8,
    hingeY,
    armWidth,
    topZ0,
    topZ0 + topH
  )

  const rightBarrel = makeRing(wasm, track, midH, outerR, boreR, hingeX, hingeY, midZ0)
  const rightArm = makeBox(
    wasm,
    track,
    hingeX + boreR + 0.08,
    rightBounds.min[0] + armOverlap,
    hingeY,
    armWidth,
    midZ0,
    midZ0 + midH
  )

  return {
    leftSolid: addAll(track, leftSolid, [pin, bottomKnuckle, topKnuckle, leftBottomArm, leftTopArm]),
    rightSolid: addAll(track, rightSolid, [rightBarrel, rightArm])
  }
}

/**
 * Builds ordinary shape-mode clicker tiles as separate bodies, then adds
 * print-in-place hinge knuckles between neighboring base bodies.
 */
export function buildFlexiClicker(wasm, socket, stem, tiles, params = {}) {
  const validTiles = (tiles || []).filter((tile) => tile?.outline?.length)
  if (validTiles.length < 2) {
    throw new Error('Mode flexi butuh minimal 2 huruf yang menghasilkan bentuk')
  }

  const trash = []
  const track = (value) => {
    trash.push(value)
    return value
  }
  const clearance = Math.max(0.2, Math.min(0.6, Number(params.flexiClearanceMm) || 0.35))
  const connectionStyle = params.flexiConnectionStyle === 'strap' ? 'strap' : 'hinge'
  const strapHoleMm = Math.max(2.5, Math.min(5, Number(params.flexiStrapHoleMm) || 3.2))
  const hingeGap = connectionStyle === 'strap' ? Math.max(4.5, strapHoleMm + 1.2) : 7.2
  const built = []
  const warnings = []

  try {
    for (let i = 0; i < validTiles.length; i++) {
      const tile = validTiles[i]
      const result = buildClicker(wasm, socket, stem, tile.regions || [], tile.outline, {
        ...params,
        flexiEnabled: false,
        baseShape: 'outline',
        imageMarginMm: 0,
        imageMargin: 0,
        outlineSmoothingRadius: 0.35,
        keyringEnabled: connectionStyle === 'hinge' && i === 0 && params.keyringEnabled === true,
        keychain: connectionStyle === 'hinge' && i === 0 ? params.keychain : null,
        switches: [{ x: 0, y: 0, rotation: 0 }],
        maxSizeMm: tile.capWidthMm || params.maxSizeMm,
        capWidthMm: tile.capWidthMm || params.capWidthMm || params.maxSizeMm
      })
      warnings.push(...(result.warnings || []))

      const baseParts = result.parts.filter((part) => part.group === 'base')
      const topParts = result.parts.filter((part) => part.group === 'top')
      if (!baseParts.length || !topParts.length) throw new Error('Tile flexi gagal dibuat')

      const baseSolids = baseParts.map((part) => track(partToSolid(wasm, part)))
      const baseSolid = addAll(track, baseSolids[0], baseSolids.slice(1))
      built.push({
        baseSolid,
        topParts,
        baseColorRgb: baseParts[0].colorRgb,
        bounds: baseSolid.boundingBox()
      })
    }

    let cursor = 0
    let minY = Infinity
    let maxY = -Infinity
    const placed = built.map((tile) => {
      const bb = tile.bounds
      const dx = cursor - bb.min[0]
      const dy = -((bb.min[1] + bb.max[1]) / 2)
      const width = bb.max[0] - bb.min[0]
      cursor += width + hingeGap
      minY = Math.min(minY, bb.min[1] + dy)
      maxY = Math.max(maxY, bb.max[1] + dy)
      return {
        ...tile,
        dx,
        dy,
        solid: track(tile.baseSolid.translate([dx, dy, 0])),
        bounds: {
          min: [bb.min[0] + dx, bb.min[1] + dy, bb.min[2]],
          max: [bb.max[0] + dx, bb.max[1] + dy, bb.max[2]]
        }
      }
    })

    const totalWidth = cursor - hingeGap
    const centerDx = -totalWidth / 2
    for (const tile of placed) {
      tile.solid = track(tile.solid.translate([centerDx, 0, 0]))
      tile.bounds.min[0] += centerDx
      tile.bounds.max[0] += centerDx
    }

    if (connectionStyle === 'strap') {
      for (let i = 0; i < placed.length; i++) {
        placed[i].solid = addStrapTunnel(wasm, track, placed[i].solid, placed[i].bounds, strapHoleMm)
      }
    } else {
      for (let i = 0; i < placed.length - 1; i++) {
        const left = placed[i]
        const right = placed[i + 1]
        const pair = addHingePair(wasm, track, left.solid, right.solid, left.bounds, right.bounds, clearance)
        left.solid = pair.leftSolid
        right.solid = pair.rightSolid
      }
    }

    const parts = []
    for (let i = 0; i < placed.length; i++) {
      const tile = placed[i]
      parts.push(toPart(tile.solid, 'body', 'base', tile.baseColorRgb, `base-body-${i + 1}`))
      for (const topPart of tile.topParts) {
        parts.push(translatePart(topPart, tile.dx + centerDx, tile.dy, 0, `${i + 1}`))
      }
    }

    if (connectionStyle === 'strap') {
      warnings.push(`Lubang tali aktif: ${placed.length} tunnel sisi-ke-sisi di tengah base, di bawah cavity switch.`)
    } else {
      warnings.push(`Flexi print-in-place aktif: ${placed.length - 1} engsel, celah ${clearance.toFixed(2)} mm.`)
    }
    return {
      parts,
      switchPlacements: placed.map((tile) => ({ x: tile.dx + centerDx, y: tile.dy, rotation: 0 })),
      warnings,
      flexi: {
        enabled: true,
        connectionStyle,
        jointCount: connectionStyle === 'hinge' ? placed.length - 1 : 0,
        clearanceMm: connectionStyle === 'hinge' ? clearance : null,
        strapHoleMm: connectionStyle === 'strap' ? strapHoleMm : null,
        strapHoleCount: connectionStyle === 'strap' ? placed.length * 2 : 0,
        strapTunnelCount: connectionStyle === 'strap' ? placed.length : 0,
        widthMm: totalWidth,
        depthMm: isFinite(minY) && isFinite(maxY) ? maxY - minY : null
      }
    }
  } finally {
    for (const value of trash.reverse()) {
      try {
        value.delete?.()
      } catch {
        /* already freed */
      }
    }
  }
}


function keychainSpec(params, angleDeg) {
  return {
    enabled: true,
    style: params.keyringStyle === 'hole' ? 'hole' : 'loop',
    holeDiameterMm: params.keyringHoleMm ?? 5.2,
    outerDiameterMm: params.keyringTabMm ?? 12,
    angleDeg,
    offsetMm: params.keyringOffsetMm ?? 0
  }
}

function resolveSnapFitDims(params = {}) {
  const clearance = Math.max(0.25, Math.min(0.35, Number(params.snapFitClearanceMm) || 0.28))
  // Bottom T-rail height above floor (FDM-printable neck/head).
  const railHeight = Math.max(1.6, Math.min(2.2, Number(params.snapFitThicknessMm) || 1.9))
  const neckLen = 2.6
  const headLen = 2.2
  const neckW = 3.6
  const headW = 6.4
  const chamfer = 0.4
  const bossDiameter = Math.max(1.6, Math.min(2.2, Number(params.snapFitBossMm) || 1.9))
  const bossRadius = bossDiameter / 2
  const bossHeight = Math.max(1.0, Math.min(1.5, railHeight * 0.7))
  const latchThickness = Math.max(0.95, Math.min(1.25, Number(params.snapFitLatchMm) || 1.1))
  const holeRadius = bossRadius + clearance * 0.55
  const tabWidth = Math.max(headW * 0.72, holeRadius * 2 + 1.6)
  const slotWidth = 0.9
  const slotLen = neckLen + headLen + 1.2
  const flexRelief = 0.85
  return {
    clearance,
    // Legacy field: UI/tests still read thicknessMm as the primary lock height.
    thickness: railHeight,
    railHeight,
    neckLen,
    headLen,
    neckW,
    headW,
    chamfer,
    bossRadius,
    bossHeight,
    latchThickness,
    holeRadius,
    tabWidth,
    slotWidth,
    slotLen,
    flexRelief,
    bossOffsetX: neckLen + headLen * 0.55,
    protrusion: neckLen + headLen
  }
}

function makeCenteredBox(wasm, track, cx, cy, cz, sx, sy, sz) {
  return track(
    wasm.Manifold
      .cube([Math.max(0.05, sx), Math.max(0.05, sy), Math.max(0.05, sz)], true)
      .translate([cx, cy, cz])
  )
}

/**
 * Male bottom lock: horizontal T-rail protruding +X near the floor, with a
 * raised cylindrical boss on the rail top that clicks into the female latch hole.
 */
function makeMaleBottomRail(wasm, track, edgeX, yMid, zFloor, dims) {
  const z0 = zFloor
  const z1 = zFloor + dims.railHeight
  const h = Math.max(0.05, z1 - z0)
  const cz = (z0 + z1) / 2
  const neck = makeCenteredBox(
    wasm,
    track,
    edgeX + dims.neckLen / 2,
    yMid,
    cz,
    dims.neckLen,
    dims.neckW,
    h
  )
  const head = makeCenteredBox(
    wasm,
    track,
    edgeX + dims.neckLen + dims.headLen / 2,
    yMid,
    cz,
    dims.headLen,
    dims.headW,
    h
  )
  let rail = track(neck.add(head))
  // Tip chamfer on T-head for easier channel entry.
  if (dims.chamfer > 0.05) {
    const ch = dims.chamfer
    const tipX = edgeX + dims.protrusion
    rail = track(rail.subtract(
      makeCenteredBox(wasm, track, tipX - ch * 0.35, yMid, z1 - ch * 0.45, ch * 0.9, dims.headW + 0.2, ch)
    ))
    rail = track(rail.subtract(
      makeCenteredBox(wasm, track, tipX - ch * 0.35, yMid, z0 + ch * 0.45, ch * 0.9, dims.headW + 0.2, ch)
    ))
  }
  const boss = makeCylinder(
    wasm,
    track,
    dims.bossHeight,
    dims.bossRadius,
    edgeX + dims.bossOffsetX,
    yMid,
    z1
  )
  return track(rail.add(boss))
}

/**
 * Female bottom T-channel cutter (opens at edgeX, extends +X). Sized with
 * clearance around the male rail.
 */
function makeFemaleBottomChannelCutter(wasm, track, edgeX, yMid, zFloor, dims) {
  const c = dims.clearance
  const z0 = zFloor - c * 0.5
  const z1 = zFloor + dims.railHeight + c
  const h = Math.max(0.05, z1 - z0)
  const cz = (z0 + z1) / 2
  const openExtra = 0.7
  const neck = makeCenteredBox(
    wasm,
    track,
    edgeX + dims.neckLen / 2 - openExtra / 2,
    yMid,
    cz,
    dims.neckLen + openExtra + c,
    dims.neckW + 2 * c,
    h
  )
  const head = makeCenteredBox(
    wasm,
    track,
    edgeX + dims.neckLen + dims.headLen / 2,
    yMid,
    cz,
    dims.headLen + 2 * c,
    dims.headW + 2 * c,
    h
  )
  let channel = track(neck.add(head))
  if (dims.chamfer > 0.05) {
    const flare = makeCenteredBox(
      wasm,
      track,
      edgeX + dims.chamfer * 0.35,
      yMid,
      cz,
      dims.chamfer * 1.1,
      dims.headW + 2 * c + dims.chamfer * 1.4,
      h
    )
    channel = track(channel.add(flare))
  }
  return channel
}

/**
 * Female cantilever latch cutters: two side slots free a spring tab, a circular
 * hole captures the male boss, plus lead-in + flex relief for a press-to-release click.
 */
function makeFemaleLatchCutters(wasm, track, edgeX, yMid, zFloor, dims) {
  const c = dims.clearance
  const latchZ0 = zFloor + dims.railHeight + c * 0.35
  const latchZ1 = latchZ0 + dims.latchThickness
  const latchH = Math.max(0.05, latchZ1 - latchZ0)
  const latchCz = (latchZ0 + latchZ1) / 2
  const halfTab = dims.tabWidth / 2
  const slotY = halfTab + dims.slotWidth / 2
  const slotCx = edgeX + dims.slotLen / 2
  const slotL = makeCenteredBox(
    wasm,
    track,
    slotCx,
    yMid - slotY,
    latchCz,
    dims.slotLen,
    dims.slotWidth,
    latchH + 0.2
  )
  const slotR = makeCenteredBox(
    wasm,
    track,
    slotCx,
    yMid + slotY,
    latchCz,
    dims.slotLen,
    dims.slotWidth,
    latchH + 0.2
  )
  // Hole through the latch plate (press-to-release "klik" target).
  const hole = makeCylinder(
    wasm,
    track,
    latchH + 0.6,
    dims.holeRadius,
    edgeX + dims.bossOffsetX,
    yMid,
    latchZ0 - 0.3
  )
  // Lead-in under the free end so the boss can cam the latch up while sliding in.
  const lead = makeCenteredBox(
    wasm,
    track,
    edgeX + dims.bossOffsetX * 0.45,
    yMid,
    latchZ0 + dims.latchThickness * 0.25,
    Math.max(1.2, dims.bossOffsetX * 0.85),
    dims.tabWidth * 0.9,
    dims.latchThickness * 0.55
  )
  // Shallow pocket above the tab so it can flex upward when pressed / cammed.
  const relief = makeCenteredBox(
    wasm,
    track,
    edgeX + dims.slotLen / 2,
    yMid,
    latchZ1 + dims.flexRelief / 2,
    dims.slotLen * 0.92,
    dims.tabWidth + dims.slotWidth * 2,
    dims.flexRelief
  )
  return track(slotL.add(slotR).add(hole).add(lead).add(relief))
}

function addSnapFitPair(wasm, track, left, right, dims) {
  const yMid =
    (
      (left.bounds.min[1] + left.bounds.max[1])
      + (right.bounds.min[1] + right.bounds.max[1])
    ) / 4
  const zFloor = Math.max(left.bounds.min[2], right.bounds.min[2])
  const railHeight = Math.min(
    dims.railHeight,
    Math.max(1.6, Math.min(left.bounds.max[2], right.bounds.max[2]) - zFloor - 3.5)
  )
  const localDims = { ...dims, railHeight, thickness: railHeight }

  const male = makeMaleBottomRail(wasm, track, left.bounds.max[0], yMid, zFloor, localDims)
  const channel = makeFemaleBottomChannelCutter(
    wasm,
    track,
    right.bounds.min[0],
    yMid,
    zFloor,
    localDims
  )
  const latchCuts = makeFemaleLatchCutters(
    wasm,
    track,
    right.bounds.min[0],
    yMid,
    zFloor,
    localDims
  )
  return {
    leftSolid: track(left.solid.add(male)),
    rightSolid: track(right.solid.subtract(channel).subtract(latchCuts)),
    z0: zFloor,
    z1: zFloor + railHeight,
    thickness: railHeight
  }
}

/**
 * Separate shape-mode bases with bottom T-rail / click-latch snap-fit locks
 * (clip kunci). Optional hang keyring loop stays on a chain end only.
 */
export function buildSnapFitLinkedClicker(wasm, socket, stem, tiles, params = {}) {
  const validTiles = (tiles || []).filter((tile) => tile?.outline?.length)
  if (validTiles.length < 2) {
    throw new Error('Clip kunci snap-fit butuh minimal 2 huruf')
  }

  const trash = []
  const track = (value) => {
    trash.push(value)
    return value
  }
  const dims = resolveSnapFitDims(params)
  // Print layout gap: keep tiles separate so the bottom rail does not fuse; assemble after printing.
  const linkGap = Math.max(dims.protrusion + 1.6, 6.5)
  const hangEnabled = params.keyringEnabled === true
  const hangAngle = Number(params.keyringAngleDeg)
  const hangDeg = Number.isFinite(hangAngle) ? ((hangAngle % 360) + 360) % 360 : 270
  const built = []
  const warnings = []

  try {
    for (let i = 0; i < validTiles.length; i++) {
      const tile = validTiles[i]
      const keychains = []
      if (hangEnabled) {
        const isLeftEnd = i === 0
        const isRightEnd = i === validTiles.length - 1
        const hangOnLeft = hangDeg >= 225 && hangDeg <= 315
        const hangOnRight = hangDeg >= 45 && hangDeg <= 135
        const hangOnTop = hangDeg < 45 || hangDeg > 315
        const hangOnBottom = hangDeg > 135 && hangDeg < 225
        if (hangOnLeft && isLeftEnd) keychains.push(keychainSpec(params, 270))
        else if (hangOnRight && isRightEnd) keychains.push(keychainSpec(params, 90))
        else if ((hangOnTop || hangOnBottom) && isLeftEnd) {
          keychains.push(keychainSpec(params, hangOnTop ? 0 : 180))
        }
      }

      const result = buildClicker(wasm, socket, stem, tile.regions || [], tile.outline, {
        ...params,
        flexiEnabled: false,
        snapFitEnabled: false,
        keyringLinkEnabled: false,
        baseShape: 'outline',
        imageMarginMm: 0,
        imageMargin: 0,
        outlineSmoothingRadius: 0.35,
        keyringEnabled: keychains.length > 0,
        keychain: null,
        keychains,
        switches: [{ x: 0, y: 0, rotation: 0 }],
        maxSizeMm: tile.capWidthMm || params.maxSizeMm,
        capWidthMm: tile.capWidthMm || params.capWidthMm || params.maxSizeMm
      })
      warnings.push(...(result.warnings || []))

      const baseParts = result.parts.filter((part) => part.group === 'base')
      const topParts = result.parts.filter((part) => part.group === 'top')
      if (!baseParts.length || !topParts.length) throw new Error('Tile snap-fit gagal dibuat')

      const baseSolids = baseParts.map((part) => track(partToSolid(wasm, part)))
      const baseSolid = addAll(track, baseSolids[0], baseSolids.slice(1))
      built.push({
        baseSolid,
        topParts,
        baseColorRgb: baseParts[0].colorRgb,
        bounds: baseSolid.boundingBox()
      })
    }

    let cursor = 0
    let minY = Infinity
    let maxY = -Infinity
    const placed = built.map((tile) => {
      const bb = tile.bounds
      const dx = cursor - bb.min[0]
      const dy = -((bb.min[1] + bb.max[1]) / 2)
      const width = bb.max[0] - bb.min[0]
      cursor += width + linkGap
      minY = Math.min(minY, bb.min[1] + dy)
      maxY = Math.max(maxY, bb.max[1] + dy)
      return {
        ...tile,
        dx,
        dy,
        solid: track(tile.baseSolid.translate([dx, dy, 0])),
        bounds: {
          min: [bb.min[0] + dx, bb.min[1] + dy, bb.min[2]],
          max: [bb.max[0] + dx, bb.max[1] + dy, bb.max[2]]
        }
      }
    })

    const totalWidth = cursor - linkGap
    const centerDx = -totalWidth / 2
    for (const tile of placed) {
      tile.solid = track(tile.solid.translate([centerDx, 0, 0]))
      tile.bounds.min[0] += centerDx
      tile.bounds.max[0] += centerDx
    }

    let usedThickness = dims.thickness
    for (let i = 0; i < placed.length - 1; i++) {
      const pair = addSnapFitPair(wasm, track, placed[i], placed[i + 1], dims)
      placed[i].solid = pair.leftSolid
      placed[i + 1].solid = pair.rightSolid
      usedThickness = pair.thickness
      // Refresh bounds after boolean ops so subsequent pairs use updated edges.
      const lb = placed[i].solid.boundingBox()
      const rb = placed[i + 1].solid.boundingBox()
      placed[i].bounds = { min: [...lb.min], max: [...lb.max] }
      placed[i + 1].bounds = { min: [...rb.min], max: [...rb.max] }
    }

    const parts = []
    for (let i = 0; i < placed.length; i++) {
      const tile = placed[i]
      parts.push(toPart(tile.solid, 'body', 'base', tile.baseColorRgb, `base-body-${i + 1}`))
      for (const topPart of tile.topParts) {
        parts.push(translatePart(topPart, tile.dx + centerDx, tile.dy, 0, `${i + 1}`))
      }
    }

    const linkCount = placed.length - 1
    warnings.push(
      `Clip kunci snap-fit: ${placed.length} base terpisah, ${linkCount} pasangan rail bawah + latch klik (tinggi rail ~${usedThickness.toFixed(1)} mm, clearance ${dims.clearance.toFixed(2)} mm). Geser rail ke channel hingga boss masuk lubang — tekan latch untuk lepas. Jangan digabung dengan flexi.`
    )
    const snapFit = {
      enabled: true,
      style: 'bottom-rail-latch',
      tileCount: placed.length,
      linkCount,
      clearanceMm: dims.clearance,
      thicknessMm: usedThickness,
      railHeightMm: usedThickness,
      latchThicknessMm: dims.latchThickness,
      bossDiameterMm: dims.bossRadius * 2,
      tabProtrusionMm: dims.protrusion,
      gapMm: linkGap,
      widthMm: totalWidth,
      depthMm: isFinite(minY) && isFinite(maxY) ? maxY - minY : null
    }
    return {
      parts,
      switchPlacements: placed.map((tile) => ({ x: tile.dx + centerDx, y: tile.dy, rotation: 0 })),
      warnings,
      flexi: null,
      snapFit,
      // Legacy alias for older callers
      keyringLink: {
        enabled: true,
        tileCount: snapFit.tileCount,
        linkCount: snapFit.linkCount,
        gapMm: snapFit.gapMm,
        widthMm: snapFit.widthMm,
        depthMm: snapFit.depthMm
      }
    }
  } finally {
    for (const value of trash.reverse()) {
      try {
        value.delete?.()
      } catch {
        /* already freed */
      }
    }
  }
}

/** @deprecated Use buildSnapFitLinkedClicker — facing keyring loops were the wrong clip-kunci model. */
export function buildKeyringLinkedClicker(wasm, socket, stem, tiles, params = {}) {
  return buildSnapFitLinkedClicker(wasm, socket, stem, tiles, params)
}
