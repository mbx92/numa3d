// Logika generate clicker — base + lid (konsep MakerWorld).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { resolveClickerOptions, validateOuterSize } from './clickerPresets.js'
import { footprintToOuterSize, resolveFootprint } from './clickerFootprint.js'

const EXTRUDE = { bevelEnabled: false, curveSegments: 6 }

export function packGeometry(geo) {
  const pos = geo.attributes.position
  const norm = geo.attributes.normal
  return {
    positions: new Float32Array(pos.array),
    normals: norm ? new Float32Array(norm.array) : null
  }
}

export function unpackGeometry(data) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  if (data.normals) geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3))
  else geo.computeVertexNormals()
  return geo
}

function slugify(text) {
  return (
    String(text || 'clicker')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 32) || 'clicker'
  )
}

function solidBox(w, d, h, x, y, z) {
  const geo = new THREE.BoxGeometry(w, d, h)
  geo.translate(x, y, z)
  return geo
}

function mergeParts(parts) {
  const usable = parts.filter((g) => g?.attributes?.position?.count)
  if (!usable.length) throw new Error('Geometry kosong')
  const normalized = usable.map((g) => {
    const next = g.index ? g.toNonIndexed() : g.clone()
    if (next !== g) g.dispose()
    return next
  })
  if (normalized.length === 1) return normalized[0]
  const merged = mergeGeometries(normalized, false)
  normalized.forEach((g) => g.dispose())
  if (!merged) throw new Error('Gagal menggabungkan geometry')
  merged.computeVertexNormals()
  return merged
}

function extrudeShapes(shapes, depth) {
  const parts = shapes.map((shape) => new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, depth }))
  return mergeParts(parts)
}

/** Lubang silinder vertikal — 4 dinding kotak mengelilingi sumbu Z. */
function verticalHoleRing(outer, inner, height, x, y, z) {
  const t = (outer - inner) / 2
  if (t <= 0.05) return []
  return [
    solidBox(outer, t, height, x, y + (inner + t) / 2, z),
    solidBox(outer, t, height, x, y - (inner + t) / 2, z),
    solidBox(t, inner, height, x + (inner + t) / 2, y, z),
    solidBox(t, inner, height, x - (inner + t) / 2, y, z)
  ]
}

/** Base tray: lantai + dinding + pocket switch terbuka atas. */
function buildBaseBody(opts) {
  const { outerWidthMm: ow, outerDepthMm: od, outerHeightMm: oh, floorThicknessMm: floor } = opts
  const pocket = opts.housingPocketMm
  const halfW = ow / 2
  const halfD = od / 2
  const wallH = oh - floor
  const wallZ = floor + wallH / 2

  const parts = [solidBox(ow, od, floor, 0, 0, floor / 2)]

  const sideDepth = (od - pocket) / 2
  const sideWidth = (ow - pocket) / 2

  if (sideDepth > 0.05) {
    parts.push(solidBox(ow, sideDepth, wallH, 0, -halfD + sideDepth / 2, wallZ))
    parts.push(solidBox(ow, sideDepth, wallH, 0, halfD - sideDepth / 2, wallZ))
  }
  if (sideWidth > 0.05) {
    parts.push(solidBox(sideWidth, pocket, wallH, -halfW + sideWidth / 2, 0, wallZ))
    parts.push(solidBox(sideWidth, pocket, wallH, halfW - sideWidth / 2, 0, wallZ))
  }

  if (opts.keyringEnabled) {
    const tab = Number(opts.keyringTabMm) || 10
    const hole = Number(opts.keyringHoleMm) || 4.5
    const tabZ = oh - 1.5
    const tabX = -halfW - tab / 2 + 0.6
    parts.push(solidBox(tab * 0.5, 2.5, 3, -halfW - tab * 0.25, 0, tabZ))
    parts.push(...verticalHoleRing(tab, hole, 2.6, tabX, 0, tabZ))
  }

  return mergeParts(parts)
}

/** Lid: extrude bentuk + lubang stem + collar bawah. */
function buildLid(opts, footprint) {
  const lidH = Number(opts.lidHeightMm) || 10
  const stemD = Number(opts.stemHoleMm) || 4.2
  const collarH = Math.min(4, lidH * 0.35)
  const capH = lidH - collarH

  const cap = extrudeShapes(footprint.shapes, capH)
  cap.translate(0, 0, collarH)

  const collarOuter = stemD + 3.2
  const collarParts = verticalHoleRing(collarOuter, stemD, collarH, 0, 0, collarH / 2)
  const collar = mergeParts(collarParts)

  return mergeParts([cap, collar])
}

function placeLidForAssembly(lidGeo, opts) {
  const oh = opts.outerHeightMm
  const lidH = Number(opts.lidHeightMm) || 10
  const clone = lidGeo.clone()
  const z = oh - lidH * 0.15

  if (opts.displayMode === 'print') {
    clone.rotateX(Math.PI)
    clone.translate(0, 0, z - lidH / 2)
  } else {
    clone.translate(0, 0, z)
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

  if (opts.shapeMode !== 'rect') {
    const outer = footprintToOuterSize(footprint, opts)
    opts = { ...opts, ...outer }
  }
  validateOuterSize(opts)

  const colors = opts.colors
  const baseGeo = buildBaseBody(opts)
  const lidGeoRaw = buildLid(opts, footprint)
  const lidGeoAssembly = placeLidForAssembly(lidGeoRaw, opts)

  const basePreviewParts = [{ geometry: baseGeo, color: colors.base, role: 'base' }]
  const lidPreviewParts = [{ geometry: lidGeoRaw, color: colors.lid, role: 'lid' }]
  const assemblyPreviewParts = [
    { geometry: baseGeo, color: colors.base },
    { geometry: lidGeoAssembly, color: colors.lid }
  ]

  const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial())
  const lidMesh = new THREE.Mesh(lidGeoRaw, new THREE.MeshStandardMaterial())
  const slug = slugify(opts.label || opts.text)

  const result = {
    slug,
    shapeMode: opts.shapeMode,
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
      footprintWidthMm: Number(footprint.bounds.width.toFixed(1)),
      footprintDepthMm: Number(footprint.bounds.height.toFixed(1)),
      housingPocketMm: Number(opts.housingPocketMm.toFixed(2)),
      switchDepthMm: Number(opts.switchDepthMm.toFixed(2)),
      plateOpeningMm: Number(opts.plateOpeningMm.toFixed(2)),
      fitToleranceMm: Number(opts.fitToleranceMm.toFixed(2)),
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
      color: p.color
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
