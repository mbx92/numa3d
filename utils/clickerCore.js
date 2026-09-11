// Logika generate clicker — shape extrusion + clipper (referensi Vostok Labs).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { resolveClickerOptions, validateOuterSize } from './clickerPresets.js'
import { footprintToOuterSize, resolveFootprint } from './clickerFootprint.js'
import {
  buildSkirtRingShapes,
  buildStemShapes,
  resolveMechanicalFootprint
} from './clickerShapes.js'
import { offsetShapes, subtractShapes2D } from './shapeClipper.js'
import { packGeometry } from './geometryPack.js'

const EXTRUDE = { bevelEnabled: false, curveSegments: 10 }
const PLATE_GAP_MM = 5

function slugify(text) {
  return (
    String(text || 'clicker')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 32) || 'clicker'
  )
}

function normalizeGeo(geo) {
  if (!geo?.attributes?.position?.count) return null
  const next = geo.index ? geo.toNonIndexed() : geo.clone()
  if (next !== geo) geo.dispose()
  next.computeVertexNormals()
  return next
}

function mergeParts(parts) {
  const usable = parts.map(normalizeGeo).filter(Boolean)
  if (!usable.length) throw new Error('Geometry kosong')
  if (usable.length === 1) return usable[0]
  const merged = mergeGeometries(usable, false)
  usable.forEach((g) => g.dispose())
  if (!merged) throw new Error('Gagal menggabungkan geometry')
  merged.computeVertexNormals()
  return merged
}

function extrudeShapes(shapes, depth) {
  if (!shapes?.length || depth <= 0.02) return null
  const parts = shapes.map((shape) => new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, depth }))
  try {
    return mergeParts(parts)
  } finally {
    parts.forEach((g) => g.dispose())
  }
}

function bboxOfGeometry(geo) {
  geo.computeBoundingBox()
  const b = geo.boundingBox
  return {
    minX: b.min.x,
    maxX: b.max.x,
    minY: b.min.y,
    maxY: b.max.y,
    minZ: b.min.z,
    maxZ: b.max.z,
    width: b.max.x - b.min.x,
    depth: b.max.y - b.min.y,
    height: b.max.z - b.min.z,
    centerX: (b.min.x + b.max.x) / 2,
    centerY: (b.min.y + b.max.y) / 2,
    centerZ: (b.min.z + b.max.z) / 2
  }
}

function buildBezelRing(outerShapes, innerShapes) {
  const ring = subtractShapes2D(outerShapes, innerShapes)
  return ring.length ? ring : subtractShapes2D(offsetShapes(outerShapes, 0.01), innerShapes)
}

function circleAt(cx, cy, r, segments = 32) {
  const shape = new THREE.Shape()
  shape.absarc(cx, cy, r, 0, Math.PI * 2, false)
  return shape
}

function bridgeShapeBetween(a, b, width) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const hw = width / 2
  const shape = new THREE.Shape()
  shape.moveTo(a.x + nx * hw, a.y + ny * hw)
  shape.lineTo(b.x + nx * hw, b.y + ny * hw)
  shape.lineTo(b.x - nx * hw, b.y - ny * hw)
  shape.lineTo(a.x - nx * hw, a.y - ny * hw)
  shape.closePath()
  return shape
}

function edgePointFromBounds(bounds, angleDeg) {
  const angle = (angleDeg * Math.PI) / 180
  const dir = { x: Math.sin(angle), y: Math.cos(angle) }
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const depth = bounds.depth ?? bounds.height ?? (bounds.maxY - bounds.minY)
  const tx = Math.abs(dir.x) > 1e-6
    ? ((dir.x > 0 ? bounds.maxX : bounds.minX) - cx) / dir.x
    : Infinity
  const ty = Math.abs(dir.y) > 1e-6
    ? ((dir.y > 0 ? bounds.maxY : bounds.minY) - cy) / dir.y
    : Infinity
  const t = Math.min(tx > 0 ? tx : Infinity, ty > 0 ? ty : Infinity)
  const reach = Number.isFinite(t) ? t : Math.max(bounds.width, depth) / 2
  return {
    x: cx + dir.x * reach,
    y: cy + dir.y * reach,
    dir
  }
}

function keyringStrapHoleShapes(bounds, angleDeg, holeMm, offsetMm = 0) {
  const holeR = Math.max(1.5, holeMm / 2)
  const edge = edgePointFromBounds(bounds, angleDeg)
  const dir = edge.dir
  const tangent = { x: -dir.y, y: dir.x }
  const inset = Math.max(holeR + 2.0, 4.5)
  let hcx
  let hcy
  if (Math.abs(dir.x) >= Math.abs(dir.y)) {
    hcx = dir.x < 0 ? bounds.minX + inset : bounds.maxX - inset
    hcy = bounds.maxY - inset + offsetMm
  } else {
    hcx = bounds.minX + inset + offsetMm
    hcy = dir.y < 0 ? bounds.minY + inset : bounds.maxY - inset
  }
  const slotOffset = holeR * 0.42
  const p0 = { x: hcx - tangent.x * slotOffset, y: hcy - tangent.y * slotOffset }
  const p1 = { x: hcx + tangent.x * slotOffset, y: hcy + tangent.y * slotOffset }
  return [
    circleAt(p0.x, p0.y, holeR),
    circleAt(p1.x, p1.y, holeR),
    bridgeShapeBetween(p0, p1, holeR * 2)
  ]
}

/** Base button-in-bezel — siluet mengikuti bentuk desain. */
function buildBaseBody(opts, mech) {
  const floor = opts.floorThicknessMm
  const oh = opts.outerHeightMm
  const switchDepth = opts.switchDepthMm
  const topRim = opts.topRimMm

  const wellFloorZ = floor + switchDepth
  const wellTopZ = oh - topRim
  const bezelH = Math.max(1, wellTopZ - wellFloorZ)

  const keyringAllowed =
    opts.keyringEnabled === true
    && opts.shapeMode === 'rect'
    && opts.flexiEnabled !== true
  const keyringStyle = opts.keyringStyle === 'hole' ? 'hole' : 'loop'
  const holeMm = Number(opts.keyringHoleMm) || 5.2
  const angleDeg = Number(opts.keyringAngleDeg) || 270

  let bodyShapes = mech.bodyShapes
  if (keyringAllowed && keyringStyle === 'hole') {
    const punched = subtractShapes2D(
      mech.bodyShapes,
      keyringStrapHoleShapes(mech.bodyBounds, angleDeg, holeMm, Number(opts.keyringOffsetMm) || 0)
    )
    if (punched.length) bodyShapes = punched
  }

  const parts = []

  // Lantai solid mengikuti siluet body
  const floorGeo = extrudeShapes(bodyShapes, floor)
  if (floorGeo) parts.push(floorGeo)

  // Dinding pocket switch (ring antara body & pocket)
  const pocketWallH = switchDepth
  const pocketWalls = buildBezelRing(bodyShapes, [mech.pocketShape])
  const pocketWallGeo = extrudeShapes(pocketWalls, pocketWallH)
  if (pocketWallGeo) {
    pocketWallGeo.translate(0, 0, floor)
    parts.push(pocketWallGeo)
  }

  // Lantai well (ring antara well & pocket)
  const wellFloorShapes = buildBezelRing(mech.wellShapes, [mech.pocketShape])
  const wellFloorGeo = extrudeShapes(wellFloorShapes, 0.9)
  if (wellFloorGeo) wellFloorGeo.translate(0, 0, wellFloorZ - 0.45)
  if (wellFloorGeo) parts.push(wellFloorGeo)

  // Bezel — border mengelilingi well (raised frame)
  const bezelShapes = buildBezelRing(bodyShapes, mech.wellShapes)
  const bezelGeo = extrudeShapes(bezelShapes, bezelH)
  if (bezelGeo) bezelGeo.translate(0, 0, wellFloorZ)
  if (bezelGeo) parts.push(bezelGeo)

  // Plate cutout ring di rim atas (MX plate opening)
  const plateCutShapes = buildBezelRing(mech.wellShapes, [mech.plateOpeningShape])
  const rimGeo = extrudeShapes(plateCutShapes, topRim)
  if (rimGeo) rimGeo.translate(0, 0, wellTopZ)
  if (rimGeo) parts.push(rimGeo)

  // Keyring protruding loop tab (hole style already punched into bodyShapes)
  // Eyelet sized to read clearly from 3/4 view: thicker wall + more stick-out past edge.
  if (keyringAllowed && keyringStyle === 'loop') {
    const loopR = Math.max(4.2, holeMm / 2 + 2.5, (Number(opts.keyringTabMm) || 12) / 2)
    const tabThick = Math.max(2.8, Math.min(4.5, oh * 0.4))
    const edge = edgePointFromBounds(mech.bodyBounds, angleDeg)
    // Less overlap → more protrusion past the body edge (keychain-eyelet look)
    const overlap = Math.min(loopR * 0.32, Math.max(1.0, loopR - holeMm / 2 - 0.4))
    const tabX = edge.x + edge.dir.x * (loopR - overlap)
    const tabY = edge.y + edge.dir.y * (loopR - overlap)
    const innerP = { x: edge.x - edge.dir.x * overlap, y: edge.y - edge.dir.y * overlap }
    const outerP = { x: tabX + edge.dir.x * loopR * 0.32, y: tabY + edge.dir.y * loopR * 0.32 }

    const tabOuter = circleAt(tabX, tabY, loopR)
    const tabBridge = bridgeShapeBetween(innerP, outerP, Math.max(holeMm * 1.2, loopR * 1.05))
    const tabHole = circleAt(tabX, tabY, holeMm / 2)
    const tabShapes = subtractShapes2D([tabOuter, tabBridge], [tabHole])
    const tabGeo = extrudeShapes(tabShapes, tabThick)
    if (tabGeo) tabGeo.translate(0, 0, oh - tabThick)
    if (tabGeo) parts.push(tabGeo)
  }

  return mergeParts(parts)
}

/** Lid — cap plate + stem MX + perimeter skirt. */
function buildLid(opts, mech) {
  const backing = Math.max(0.8, Number(opts.topThicknessMm) || 1.5)
  const imageDepth = Math.max(0.4, Number(opts.imageDepthMm) || 2)
  const capH = backing + imageDepth
  const stemH = Number(opts.stemHeightMm) || opts.preset.stemHeightMm || 4

  const parts = []

  // Cap plate (siluet desain)
  const capGeo = extrudeShapes(mech.plateShapes, capH)
  if (capGeo) capGeo.translate(0, 0, stemH)
  if (capGeo) parts.push(capGeo)

  // Artwork layer — relief teks/SVG setebal imageDepth di atas backing
  if (mech.shapes?.length && opts.shapeMode !== 'rect') {
    const artGeo = extrudeShapes(mech.shapes, imageDepth)
    if (artGeo) artGeo.translate(0, 0, stemH + backing)
    if (artGeo) parts.push(artGeo)
  }

  // Stem MX
  const stemShapes = buildStemShapes(opts)
  const stemGeo = extrudeShapes(stemShapes, stemH)
  if (stemGeo) parts.push(stemGeo)

  // Perimeter skirt (ring offset — seperti Vostok)
  const skirtShapes = buildSkirtRingShapes(mech.plateShapes, opts)
  const skirtLen = stemH
  if (skirtShapes.length && skirtLen > 0.4) {
    const skirtGeo = extrudeShapes(skirtShapes, skirtLen + 0.3)
    if (skirtGeo) parts.push(skirtGeo)
  }

  return mergeParts(parts)
}

function placeLidForAssembly(lidGeo, baseGeo, opts) {
  const clone = lidGeo.clone()
  const baseBox = bboxOfGeometry(baseGeo)
  const lidBox = bboxOfGeometry(clone)

  const floor = opts.floorThicknessMm
  const switchDepth = opts.switchDepthMm
  const capProud = Number(opts.capProudMm) || 4
  const topRim = opts.topRimMm
  const oh = opts.outerHeightMm

  const wellFloorZ = floor + switchDepth
  const wellTopZ = oh - topRim
  const capTopTarget = wellTopZ + capProud
  const seatedZ = capTopTarget - lidBox.maxZ

  if (opts.displayMode === 'exploded') {
    const lift = lidBox.height * 0.8 + 10
    clone.translate(0, 0, seatedZ + lift)
  } else if (opts.displayMode === 'print') {
    clone.rotateX(Math.PI)
    const tx = baseBox.maxX + PLATE_GAP_MM + lidBox.width / 2 - lidBox.centerX
    const ty = lidBox.centerY * 2
    const tz = lidBox.maxZ
    clone.translate(tx, ty, tz)
  } else {
    clone.translate(0, 0, seatedZ)
  }

  clone.computeVertexNormals()
  return clone
}

function meshToStlArrayBuffer(mesh) {
  mesh.updateMatrixWorld(true)
  const exporter = new STLExporter()
  const data = exporter.parse(mesh, { binary: true })
  if (data instanceof ArrayBuffer) return data.slice(0)
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  }
  return new TextEncoder().encode(String(data)).buffer
}

export async function generateClickerCore(userOpts = {}) {
  let opts = resolveClickerOptions(userOpts)
  const footprint = await resolveFootprint(opts)

  const outer = footprintToOuterSize(footprint, opts)
  let mech = resolveMechanicalFootprint(footprint, opts)

  if (mech.plateWidthMm < outer.plateWidthMm - 0.5) {
    const grow = (outer.plateWidthMm - mech.plateWidthMm) / 2 + 0.1
    const grown = offsetShapes(mech.plateShapes, grow)
    if (grown.length) {
      mech = resolveMechanicalFootprint({ ...footprint, plateShapes: grown, shapes: footprint.shapes }, opts)
    }
  }

  opts = {
    ...opts,
    outerWidthMm: mech.outerWidthMm,
    outerDepthMm: mech.outerDepthMm,
    outerHeightMm: Math.max(
      opts.outerHeightMm,
      opts.floorThicknessMm + opts.switchDepthMm + opts.topRimMm + opts.travelMm * 0.25
    )
  }
  validateOuterSize(opts)

  const colors = opts.colors
  const baseGeo = buildBaseBody(opts, mech)
  const lidGeoRaw = buildLid(opts, mech)
  const lidGeoAssembly = placeLidForAssembly(lidGeoRaw, baseGeo, opts)

  const basePreviewParts = [{ geometry: baseGeo, color: colors.base, role: 'base' }]
  const lidPreviewParts = [{ geometry: lidGeoRaw, color: colors.lid, role: 'lid' }]
  const assemblyPreviewParts = [
    { geometry: baseGeo, color: colors.base, role: 'base' },
    { geometry: lidGeoAssembly, color: colors.lid, role: 'lid' }
  ]

  const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial())
  const lidMesh = new THREE.Mesh(lidGeoRaw, new THREE.MeshStandardMaterial())
  const slug = slugify(opts.label || opts.text)

  const result = {
    slug,
    shapeMode: opts.shapeMode,
    baseShape: opts.baseShape,
    displayMode: opts.displayMode,
    switchPresetId: opts.switchPresetId,
    switchPresetName: opts.preset.name,
    baseFilename: `${slug}_base.stl`,
    lidFilename: `${slug}_lid.stl`,
    accentFilename: `${slug}_lid.stl`,
    basePreviewColor: colors.base,
    dimensions: {
      widthMm: Number(opts.outerWidthMm.toFixed(1)),
      depthMm: Number(opts.outerDepthMm.toFixed(1)),
      heightMm: Number(opts.outerHeightMm.toFixed(1)),
      plateWidthMm: Number(mech.plateWidthMm.toFixed(1)),
      plateDepthMm: Number(mech.plateDepthMm.toFixed(1)),
      wellWidthMm: Number(mech.wellWidthMm.toFixed(1)),
      wellDepthMm: Number(mech.wellDepthMm.toFixed(1)),
      housingPocketMm: Number(opts.housingPocketMm.toFixed(2)),
      switchDepthMm: Number(opts.switchDepthMm.toFixed(2)),
      plateOpeningMm: Number(opts.plateOpeningMm.toFixed(2)),
      fitToleranceMm: Number(opts.fitToleranceMm.toFixed(2)),
      slipToleranceMm: Number(opts.slipToleranceMm.toFixed(2)),
      stemFitPct: Number(opts.stemFitPct.toFixed(1)),
      socketFitPct: Number(opts.socketFitPct.toFixed(1)),
      capProudMm: Number(opts.capProudMm.toFixed(1)),
      lidHeightMm: Number(opts.lidHeightMm.toFixed(1)),
      maxSizeMm: Number(opts.maxSizeMm.toFixed(1))
    },
    basePreviewParts: basePreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    lidPreviewParts: lidPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    accentPreviewParts: lidPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    assemblyPreviewParts: assemblyPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    baseMergedExportGeometry: packGeometry(baseGeo.clone()),
    baseMergedExportColor: colors.base,
    baseStlBuffer: meshToStlArrayBuffer(baseMesh),
    lidStlBuffer: meshToStlArrayBuffer(lidMesh),
    accentStlBuffer: meshToStlArrayBuffer(lidMesh)
  }

  baseMesh.geometry.dispose()
  lidMesh.geometry.dispose()
  lidGeoAssembly.dispose()

  return result
}
