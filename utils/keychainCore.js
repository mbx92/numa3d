// Logika generate keychain — bisa di worker (tanpa DOM).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { parse, Path } from 'opentype.js'
import { opentypePathToShapes } from './opentypeToShapes.js'
import {
  buildBaseSilhouette,
  buildInsertPlateFootprint,
  cloneShapes,
  getAttachmentReach,
  normalizeShapeHoles,
  offsetShapes,
  shapesWithHoles,
  subtractShapes2D
} from './shapeClipper.js'
import { getKeychainTheme, themeToGeneratorOptions } from './keychainThemes.js'
import { resolveTypography, resolveAccentTypography } from './keychainTypography.js'
import { applyTypographyLayout, scaleGroupsToFit } from './keychainTypographyLayout.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { buildLogoGroupFromShapes, deserializeShapes, parseSvgToShapes } from './svgToShapes.js'
import { packGeometry } from './geometryPack.js'

const fontCache = new Map()
const EXTRUDE_OPTS = (depth) => ({ depth, bevelEnabled: false, curveSegments: 5 })

function slugify(text) {
  return (
    String(text || 'keychain')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 32) || 'keychain'
  )
}

async function loadFont(fontUrl) {
  let url = fontUrl
  if (url.startsWith('/')) {
    const origin = typeof self !== 'undefined' && self.location?.origin
      ? self.location.origin
      : typeof location !== 'undefined'
        ? location.origin
        : ''
    if (origin) url = `${origin}${url}`
  }
  const key = url
  if (!fontCache.has(key)) {
    fontCache.set(
      key,
      (async () => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = await res.arrayBuffer()
        const font = parse(buffer)
        if (!font?.charToGlyph) throw new Error('parse gagal')
        return font
      })().catch((error) => {
        fontCache.delete(key)
        throw error
      })
    )
  }
  return fontCache.get(key)
}

function getTextPath(font, text, x, y, fontSize, letterSpacingMm = 0) {
  const path = new Path()
  let cursor = x
  const scale = fontSize / font.unitsPerEm
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    path.extend(glyph.getPath(cursor, y, fontSize))
    cursor += glyph.advanceWidth * scale + letterSpacingMm
  }
  return path
}

function pathToShapes(otPath) {
  return opentypePathToShapes(otPath)
}

function getCharacterGroups(font, text, fontSize, letterSpacingMm = 0, accentIndices = new Set()) {
  const groups = []
  let cursor = 0
  const scale = fontSize / font.unitsPerEm
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const glyph = font.charToGlyph(ch)
    const advance = glyph.advanceWidth * scale
    if (ch !== ' ') {
      const shapes = pathToShapes(glyph.getPath(cursor, 0, fontSize))
      if (shapes.length) groups.push({ char: ch, shapes, accent: accentIndices.has(i) })
    }
    cursor += advance + letterSpacingMm
  }
  return groups
}

function normalizeGeometryForMerge(geo) {
  if (!geo?.attributes?.position?.count) throw new Error('Geometry tidak valid')
  const normalized = geo.index ? geo.toNonIndexed() : geo.clone()
  if (normalized.morphAttributes == null) normalized.morphAttributes = {}
  if (normalized.morphTargetsRelative == null) normalized.morphTargetsRelative = false
  normalized.computeVertexNormals()
  return normalized
}

function safeMergeGeometries(geometries) {
  const parts = geometries.filter((g) => g?.attributes?.position?.count)
  if (!parts.length) throw new Error('Geometry merge kosong')
  const prepared = parts.map((g) => normalizeGeometryForMerge(g))
  if (prepared.length === 1) return prepared[0]
  const merged = mergeGeometries(prepared, false)
  prepared.forEach((g) => g.dispose())
  if (!merged?.attributes?.position?.count) throw new Error('Gagal menggabungkan geometry mesh')
  if (merged.morphAttributes == null) merged.morphAttributes = {}
  return merged
}

function extrudeShapes(shapes, depth) {
  const parts = shapes.map((shape) => new THREE.ExtrudeGeometry(shape, EXTRUDE_OPTS(depth)))
  if (!parts.length) throw new Error('Teks kosong atau font tidak menghasilkan bentuk')
  try {
    return safeMergeGeometries(parts)
  } finally {
    parts.forEach((g) => g.dispose())
  }
}

/** Hitung dimensi insert vs cavity base — teks otomatis dibatasi agar muat. */
export function resolveInsertFit(opts) {
  const base = Math.max(Number(opts.baseThicknessMm) || 3.6, 1)
  const floor = Math.min(Math.max(Number(opts.floorThicknessMm) || 0.4, 0.2), base - 0.5)
  const topClear = opts.topClearanceMm ?? 0.08
  const cavityDepth = base - floor
  const maxTextH = Math.max(cavityDepth - topClear, 0.1)
  const requested = Number(opts.textThicknessMm)
  const requestedTextH = Number.isFinite(requested) ? requested : maxTextH
  const textH = Math.min(requestedTextH, maxTextH)
  return {
    floor,
    base,
    cavityDepth,
    textH,
    topClear,
    maxTextH: Number(maxTextH.toFixed(2)),
    requestedTextH: Number(requestedTextH.toFixed(2)),
    textClamped: requestedTextH > maxTextH + 0.001
  }
}

function buildRimShapes(outerShapes, cavityOuter) {
  const rimRingShapes = subtractShapes2D(outerShapes, cavityOuter)
  return rimRingShapes.length
    ? rimRingShapes
    : shapesWithHoles(outerShapes, cavityOuter)
}

/** Dasar belakang base — eyelet menyatu di siluet, lubangnya tetap tembus. */
function buildBaseBottomCap(outerShapes) {
  return normalizeShapeHoles(cloneShapes(outerShapes))
}

function buildTrayMeshes(outerShapes, cavityShapes, baseThickness, floorThickness, ledgeMm = 0.55) {
  const cavityOuter = offsetShapes(cavityShapes, ledgeMm)
  const wallH = Math.max(baseThickness - floorThickness, 0.5)

  const bottomCapGeo = extrudeShapes(buildBaseBottomCap(outerShapes), floorThickness)

  const wallShapes = subtractShapes2D(cavityOuter, cavityShapes)
  let wallGeo = null
  if (wallShapes.length) {
    wallGeo = extrudeShapes(wallShapes, wallH)
    wallGeo.translate(0, 0, floorThickness)
  }

  const rimShapes = buildRimShapes(outerShapes, cavityOuter)
  const rimGeo = extrudeShapes(rimShapes, wallH)
  rimGeo.translate(0, 0, floorThickness)

  const geos = [bottomCapGeo, rimGeo]
  if (wallGeo) geos.push(wallGeo)
  return { bottomCapGeo, wallGeo, rimGeo, cavityOuter, merged: safeMergeGeometries(geos) }
}

function buildTrayBaseGeometry(outerShapes, cavityShapes, baseThickness, floorThickness, ledgeMm = 0.55) {
  return buildTrayMeshes(outerShapes, cavityShapes, baseThickness, floorThickness, ledgeMm).merged
}

/** Preview base: bottom cap flat + dinding cavity + rim luar. */
function buildTrayBasePreviewParts(outerShapes, cavityShapes, baseThickness, floorThickness, colors, ledgeMm = 0.55) {
  const cavityOuter = offsetShapes(cavityShapes, ledgeMm)
  const parts = []
  const wallH = Math.max(baseThickness - floorThickness, 0.5)
  const midZ = floorThickness + wallH * 0.5

  const bottomCapGeo = extrudeShapes(buildBaseBottomCap(outerShapes), floorThickness)
  parts.push({
    geometry: bottomCapGeo,
    color: colors.baseBottom || colors.base || '#8b9199',
    role: 'bottomCap'
  })

  const wallShapes = subtractShapes2D(cavityOuter, cavityShapes)
  if (wallShapes.length) {
    const wallGeo = extrudeShapes(wallShapes, wallH)
    wallGeo.translate(0, 0, floorThickness)
    parts.push({ geometry: wallGeo, color: colors.cavityWall || '#5c6570', role: 'cavityWall' })
  }

  const rimShapes = buildRimShapes(outerShapes, cavityOuter)
  const rimGeo = extrudeShapes(rimShapes, wallH)
  rimGeo.translate(0, 0, floorThickness)
  parts.push({ geometry: rimGeo, color: colors.baseHighlight || colors.base || '#a3a9b1', role: 'rim' })

  const topEdgeGeo = shapesToEdgeGeometry(cavityOuter, baseThickness - 0.02)
  parts.push({ geometry: topEdgeGeo, color: colors.cavityEdge || '#0f1419', line: true })

  const midEdgeGeo = shapesToEdgeGeometry(cavityShapes, midZ)
  parts.push({ geometry: midEdgeGeo, color: colors.cavityEdge || '#0f1419', line: true })

  return parts
}

function shapesToEdgeGeometry(shapes, z) {
  const verts = []
  for (const shape of shapes) {
    appendShapeEdges(verts, shape.getPoints(8), z)
    for (const hole of shape.holes || []) appendShapeEdges(verts, hole.getPoints(8), z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  return geo
}

function appendShapeEdges(verts, pts, z) {
  if (pts.length < 2) return
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    verts.push(a.x, a.y, z, b.x, b.y, z)
  }
}

function translateShapes(shapes, dx, dy) {
  return shapes.map((shape) => {
    const pts = shape.getPoints(10)
    const next = new THREE.Shape()
    pts.forEach((p, i) => {
      const x = p.x + dx
      const y = p.y + dy
      if (i === 0) next.moveTo(x, y)
      else next.lineTo(x, y)
    })
    next.closePath()
    for (const hole of shape.holes || []) {
      const hp = hole.getPoints(10)
      const ring = new THREE.Path()
      hp.forEach((p, i) => {
        const x = p.x + dx
        const y = p.y + dy
        if (i === 0) ring.moveTo(x, y)
        else ring.lineTo(x, y)
      })
      ring.closePath()
      next.holes.push(ring)
    }
    return next
  })
}

function translateGroups(groups, dx, dy) {
  return groups.map((g) => ({ ...g, shapes: translateShapes(g.shapes, dx, dy) }))
}

/** Insert teks: plate dalam + plate luar (ring) + huruf timbul. */
function buildInsertGeometry(groups, shapes, thickness, outerMarginMm, innerBridgeMm, colors) {
  const { inner, outer, insertFootprint } = buildInsertPlateFootprint(shapes, outerMarginMm, innerBridgeMm)
  const plateH = Math.min(Math.max(thickness * 0.32, 0.45), thickness - 0.15)
  const letterH = Math.max(thickness - plateH, 0.15)

  const outerRingShapes = subtractShapes2D(outer, inner)

  const stlParts = []
  const previewBuckets = { plateInner: [], plateOuter: [], letter: [], accent: [] }

  for (const s of inner) {
    const g = new THREE.ExtrudeGeometry(s, EXTRUDE_OPTS(plateH))
    stlParts.push(g)
    previewBuckets.plateInner.push(g.clone())
  }

  for (const s of outerRingShapes) {
    const g = new THREE.ExtrudeGeometry(s, EXTRUDE_OPTS(plateH))
    stlParts.push(g)
    previewBuckets.plateOuter.push(g.clone())
  }

  for (const group of groups) {
    for (const shape of group.shapes) {
      const g = new THREE.ExtrudeGeometry(shape, EXTRUDE_OPTS(letterH))
      g.translate(0, 0, plateH)
      stlParts.push(g)
      previewBuckets[group.logo || group.accent ? 'accent' : 'letter'].push(g.clone())
    }
  }

  const geometry = safeMergeGeometries(stlParts)
  stlParts.forEach((g) => g.dispose())

  const plateColor = colors.plate || colors.stroke || '#2b2b2b'
  const plateOuterColor = colors.plateOuter || plateColor
  const previewParts = []
  if (previewBuckets.plateInner.length) {
    previewParts.push({ geometry: safeMergeGeometries(previewBuckets.plateInner), color: plateColor, role: 'plateInner' })
    previewBuckets.plateInner.forEach((g) => g.dispose())
  }
  if (previewBuckets.plateOuter.length) {
    previewParts.push({
      geometry: safeMergeGeometries(previewBuckets.plateOuter),
      color: plateOuterColor,
      role: 'plateOuter'
    })
    previewBuckets.plateOuter.forEach((g) => g.dispose())
  }
  if (previewBuckets.letter.length) {
    previewParts.push({ geometry: safeMergeGeometries(previewBuckets.letter), color: colors.letter, role: 'letter' })
    previewBuckets.letter.forEach((g) => g.dispose())
  }
  if (previewBuckets.accent.length) {
    previewParts.push({ geometry: safeMergeGeometries(previewBuckets.accent), color: colors.accent, role: 'accent' })
    previewBuckets.accent.forEach((g) => g.dispose())
  }

  return { geometry, previewParts, insertFootprint }
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

function flattenGroupShapes(groups) {
  return groups.flatMap((g) => g.shapes)
}

/** Generate keychain — return data serializable untuk worker transfer. */
export async function generateKeychainCore(userOpts = {}) {
  const themeId = userOpts.themeId || 'sharen77'
  const theme = getKeychainTheme(themeId)
  const opts = themeToGeneratorOptions(themeId, userOpts)
  const text = String(opts.text || '').trim()
  const svgContent = String(opts.svgContent || '').trim()
  const hasSvg = !!(svgContent || opts.svgShapes?.length)
  if (!text && !hasSvg) throw new Error('Isi teks atau unggah logo SVG')

  const svgReserve = hasSvg ? (Number(opts.svgSizeMm) || 14) + (Number(opts.svgGapMm) || 2) : 0
  let groups = []

  if (text) {
    if (!opts.fontUrl) throw new Error('Font wajib dipilih untuk keychain berisi teks')

    const font = await loadFont(opts.fontUrl)
    const typography = resolveTypography(opts.typographyId)
    const letterSpacing = typography.letterSpacingMm ?? 0
    const probeSize = 100
    const probePath = getTextPath(font, text, 0, 0, probeSize, letterSpacing)
    const probeBox = probePath.getBoundingBox()
    const probeWidth = Math.max(probeBox.x2 - probeBox.x1, 0.001)
    const probeHeight = Math.max(probeBox.y2 - probeBox.y1, 0.001)
    const textTargetW = Math.max(10, opts.targetWidthMm - svgReserve)
    const scale = Math.min(textTargetW / probeWidth, opts.targetHeightMm / probeHeight)
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('Ukuran teks tidak valid — periksa lebar/tinggi (mm)')
    const fontSize = probeSize * scale
    if (fontSize < 0.05) throw new Error('Teks terlalu kecil — perbesar ukuran tag atau pendekkan teks')

    const accentSet = new Set(
      (Array.isArray(opts.accentIndices) ? opts.accentIndices : [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i < text.length)
    )
    groups = getCharacterGroups(font, text, fontSize, letterSpacing, accentSet)
    if (!groups.length) throw new Error('Gagal mengonversi teks ke bentuk 2D')

    const accentTypo = resolveAccentTypography(opts.accentIndices)
    groups = applyTypographyLayout(groups, typography, accentTypo)

    const postBounds = computeBoundsFromShapes(flattenGroupShapes(groups))
    const fitW = Math.max(10, (Number(opts.targetWidthMm) || postBounds.width) - svgReserve)
    const fitH = Number(opts.targetHeightMm) || postBounds.height
    groups = scaleGroupsToFit(groups, postBounds, fitW, fitH)

    const rawBounds = computeBoundsFromShapes(flattenGroupShapes(groups))
    const attachReach = getAttachmentReach(opts)
    const offsetX = attachReach + opts.paddingMm - rawBounds.minX
    const offsetY = -(rawBounds.minY + rawBounds.maxY) / 2
    groups = translateGroups(groups, offsetX, offsetY)
  }

  if (hasSvg) {
    const textBounds = groups.length ? computeBoundsFromShapes(flattenGroupShapes(groups)) : null
    const logoShapes = opts.svgShapes?.length
      ? deserializeShapes(opts.svgShapes)
      : parseSvgToShapes(svgContent)
    const logoGroup = buildLogoGroupFromShapes(logoShapes, opts, textBounds)
    groups = [logoGroup, ...groups]
  }

  if (!groups.length) throw new Error('Tidak ada konten untuk di-generate')

  const shapes = flattenGroupShapes(groups)
  const bounds = computeBoundsFromShapes(shapes)
  const colors = opts.colors || theme.colors
  const fit = resolveInsertFit(opts)
  const ledgeMm = opts.ledgeWidthMm ?? 0.55
  const outerMarginMm = opts.plateOuterMarginMm ?? opts.plateMarginMm ?? 1.2
  const innerBridgeMm = opts.plateInnerBridgeMm ?? opts.plateGapBridgeMm ?? 0

  // 1) Generate insert (teks + plate) dulu — footprint plate dipakai untuk cavity base
  const {
    geometry: textGeo,
    previewParts: textPreviewParts,
    insertFootprint
  } = buildInsertGeometry(groups, shapes, fit.textH, outerMarginMm, innerBridgeMm, colors)
  textGeo.translate(0, 0, fit.floor)
  for (const part of textPreviewParts) part.geometry.translate(0, 0, fit.floor)

  // 2) Cavity = footprint plate + clearance sisi
  const cavityShapes = offsetShapes(insertFootprint, opts.cavityClearanceMm)
  // 3) Body base = footprint plate + padding
  const bodyFootprint = offsetShapes(insertFootprint, opts.paddingMm)
  const { shapes: baseShapes, box, eyelet } = buildBaseSilhouette(bodyFootprint, bounds, opts)

  const baseGeo = buildTrayBaseGeometry(
    baseShapes,
    cavityShapes,
    fit.base,
    fit.floor,
    ledgeMm
  )
  baseGeo.computeVertexNormals()
  const baseMergedExportGeometry = packGeometry(baseGeo.clone())
  const baseMergedExportColor = colors.base || colors.baseBottom || '#8b9199'

  const basePreviewParts = buildTrayBasePreviewParts(
    baseShapes,
    cavityShapes,
    fit.base,
    fit.floor,
    colors,
    ledgeMm
  )

  const assemblyTextClones = textPreviewParts.map((p) => p.geometry.clone())
  const assemblyPreviewParts = [
    ...basePreviewParts
      .filter((p) => p.role !== 'bottomCap')
      .map((p) => ({ geometry: p.geometry, color: p.color, line: p.line })),
    ...assemblyTextClones.map((geo, i) => ({
      geometry: geo,
      color: textPreviewParts[i].color
    }))
  ]

  const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial())
  const textMesh = new THREE.Mesh(textGeo, new THREE.MeshStandardMaterial())
  const slug = slugify(text || 'logo')

  const result = {
    slug,
    themeId: theme.id,
    themeName: theme.name,
    attachmentType: opts.attachmentType || 'hole',
    baseFilename: `${slug}_base.stl`,
    textFilename: `${slug}_text.stl`,
    basePreviewColor: colors.base,
    dimensions: {
      widthMm: Number(box.width.toFixed(1)),
      heightMm: Number(box.height.toFixed(1)),
      baseThicknessMm: fit.base,
      textThicknessMm: Number(fit.textH.toFixed(2)),
      textThicknessRequestedMm: fit.requestedTextH,
      textThicknessMaxMm: fit.maxTextH,
      textClamped: fit.textClamped,
      cavityDepthMm: Number(fit.cavityDepth.toFixed(2)),
      floorThicknessMm: fit.floor,
      sideClearanceMm: opts.cavityClearanceMm,
      topClearanceMm: fit.topClear,
      totalLengthMm: Number(box.width.toFixed(1))
    },
    basePreviewParts: basePreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      line: !!p.line,
      role: p.role || null
    })),
    textPreviewParts: textPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    assemblyPreviewParts: assemblyPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      line: !!p.line
    })),
    baseMergedExportGeometry,
    baseMergedExportColor,
    baseStlBuffer: meshToStlArrayBuffer(baseMesh),
    textStlBuffer: meshToStlArrayBuffer(textMesh)
  }

  textGeo.dispose()
  baseGeo.dispose()
  baseMesh.geometry.dispose()
  textMesh.geometry.dispose()
  for (const p of basePreviewParts) p.geometry.dispose()
  for (const p of textPreviewParts) p.geometry.dispose()
  for (const g of assemblyTextClones) g.dispose()

  return result
}
