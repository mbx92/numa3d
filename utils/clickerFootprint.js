import * as THREE from 'three'
import { parse, Path } from 'opentype.js'
import { opentypePathToShapes } from './opentypeToShapes.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import {
  deserializeShapes,
  parseSvgToShapes,
  scaleShapes,
  translateSvgShapes
} from './svgToShapes.js'
import { meshBounds, parseMeshBuffer, orientMeshToZUp } from './clickerManifold/meshImport.js'
import {
  boundsFromShape,
  fitShapeRadius,
  makeRoundedRectShape,
  shapeForKind
} from './clickerBaseShapes.js'
import { TILE_BASE_SHAPE_IDS } from './clickerPresets.js'

const fontCache = new Map()

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
  if (!fontCache.has(url)) {
    fontCache.set(
      url,
      (async () => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = await res.arrayBuffer()
        const font = parse(buffer)
        if (!font?.charToGlyph) throw new Error('Parse font gagal')
        return font
      })()
    )
  }
  return fontCache.get(url)
}

function centerShapes(shapes) {
  const bounds = computeBoundsFromShapes(shapes)
  const dx = -(bounds.minX + bounds.maxX) / 2
  const dy = -(bounds.minY + bounds.maxY) / 2
  const moved = translateSvgShapes(shapes, dx, dy)
  const next = computeBoundsFromShapes(moved)
  return { shapes: moved, bounds: next }
}

function scaleToMaxSize(shapes, maxSizeMm) {
  const bounds = computeBoundsFromShapes(shapes)
  const maxDim = Math.max(bounds.width, bounds.height, 0.001)
  const scale = maxSizeMm / maxDim
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return centerShapes(scaleShapes(shapes, scale, cx, cy))
}

function textToShapes(text, font, fontSize = 100) {
  const path = new Path()
  let cursor = 0
  const scale = fontSize / font.unitsPerEm
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    path.extend(glyph.getPath(cursor, 0, fontSize))
    cursor += glyph.advanceWidth * scale
  }
  return opentypePathToShapes(path)
}

function opentypePathToShapesWithFlipBase(otPath, flipBase) {
  const commands = otPath?.commands
  if (!commands?.length) return []

  const shapePath = new THREE.ShapePath()
  const mapY = (y) => flipBase - y
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        shapePath.moveTo(cmd.x, mapY(cmd.y))
        break
      case 'L':
        shapePath.lineTo(cmd.x, mapY(cmd.y))
        break
      case 'C':
        shapePath.bezierCurveTo(cmd.x1, mapY(cmd.y1), cmd.x2, mapY(cmd.y2), cmd.x, mapY(cmd.y))
        break
      case 'Q':
        shapePath.quadraticCurveTo(cmd.x1, mapY(cmd.y1), cmd.x, mapY(cmd.y))
        break
      case 'Z':
        shapePath.currentPath?.closePath()
        break
      default:
        break
    }
  }
  return shapePath.toShapes()
}

function textToLetterShapeGroups(text, font, fontSize = 100) {
  const scale = fontSize / font.unitsPerEm
  return Array.from(text)
    .filter((ch) => ch.trim())
    .map((ch) => {
      const glyph = font.charToGlyph(ch)
      const glyphPath = glyph.getPath(0, 0, fontSize)
      if (!glyphPath.commands?.length) return null
      const bbox = glyphPath.getBoundingBox()
      const flipBase = -bbox.y1 - bbox.y2
      const shapes = opentypePathToShapesWithFlipBase(glyphPath, flipBase)
      if (!shapes.length) return null
      return { char: ch, advance: glyph.advanceWidth * scale, shapes }
    })
    .filter(Boolean)
}

function rectFootprint(widthMm, depthMm) {
  const hw = widthMm / 2
  const hd = depthMm / 2
  const shape = new THREE.Shape()
  shape.moveTo(-hw, -hd)
  shape.lineTo(hw, -hd)
  shape.lineTo(hw, hd)
  shape.lineTo(-hw, hd)
  shape.closePath()
  const bounds = { minX: -hw, maxX: hw, minY: -hd, maxY: hd, width: widthMm, height: depthMm }
  return { shapes: [], plateShapes: [shape], bounds, source: 'rect' }
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

function convexHull(points) {
  const sorted = [...points]
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
    .filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1])
  if (sorted.length <= 3) return sorted

  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function shapeFromRing(ring) {
  const shape = new THREE.Shape()
  ring.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()
  return shape
}

function meshFootprint(opts) {
  if (!(opts.meshBuffer instanceof ArrayBuffer)) throw new Error('Unggah atau pilih mesh untuk mode Mesh')
  const parsed = parseMeshBuffer(opts.meshBuffer, opts.meshFilename || '')
  const { raw } = orientMeshToZUp(parsed, opts.meshUpAxis || 'auto')
  const b = meshBounds(raw)
  const maxDim = Math.max(b.width, b.depth, 0.001)
  if (maxDim <= 0.001) throw new Error('3MF: ukuran mesh tidak valid')

  const scale = (Number(opts.maxSizeMm) || 40) / maxDim
  const vp = raw.vertProperties
  const np = raw.numProp || 3
  const points = []
  const stride = Math.max(1, Math.ceil((vp.length / np) / 2500))
  for (let i = 0, vertex = 0; i < vp.length; i += np, vertex++) {
    if (vertex % stride !== 0) continue
    points.push([(vp[i] - b.centerX) * scale, (vp[i + 1] - b.centerY) * scale])
  }

  let hull = convexHull(points)
  if (hull.length < 3) {
    const w = Math.max(20, b.width * scale)
    const d = Math.max(20, b.depth * scale)
    return {
      ...rectFootprint(w, d),
      source: 'mesh',
      mesh: { bounds: b, scale }
    }
  }

  const maxHullPoints = 160
  if (hull.length > maxHullPoints) {
    const step = Math.ceil(hull.length / maxHullPoints)
    hull = hull.filter((_, i) => i % step === 0)
  }

  const shape = shapeFromRing(hull)
  const bounds = computeBoundsFromShapes([shape])
  return {
    shapes: [],
    plateShapes: [shape],
    bounds,
    artworkBounds: bounds,
    source: 'mesh',
    mesh: { bounds: b, scale }
  }
}

function fitShapesIntoTile(shapes, centerX, centerY, maxW, maxH) {
  if (!shapes.length) return []
  const bounds = computeBoundsFromShapes(shapes)
  const scale = Math.min(maxW / Math.max(bounds.width, 0.001), maxH / Math.max(bounds.height, 0.001))
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const scaled = scaleShapes(shapes, scale, cx, cy)
  const nextBounds = computeBoundsFromShapes(scaled)
  const dx = centerX - (nextBounds.minX + nextBounds.maxX) / 2
  const dy = centerY - (nextBounds.minY + nextBounds.maxY) / 2
  return translateSvgShapes(scaled, dx, dy)
}

/** Margin beyond switchClear/2 so plate contains housing after slip/bezel. */
const TILE_SWITCH_FIT_MARGIN_MM = 1.25

function tileShapeForKind(kind, tileW, tileD) {
  const shapeKind = !kind || kind === 'outline' ? 'square' : kind
  if (shapeKind === 'square' || shapeKind === 'rect') {
    return makeRoundedRectShape(tileW / 2, tileD / 2, Math.min(tileW, tileD) * 0.18)
  }
  // Fallback only — prefer plateShape from tileMetaForShapeKind (already fit to switchClear).
  const radius = Math.max(tileW, tileD) / 2
  return shapeForKind(shapeKind, radius, tileW / Math.max(tileD, 0.001))
}

/** Size one letter tile so its silhouette fully contains the switch clearance square. */
function tileMetaForShapeKind(shapeKind, pocket, baseTileD) {
  const kind = !shapeKind || shapeKind === 'outline' ? 'square' : shapeKind
  const switchClear = pocket + 3
  const margin = TILE_SWITCH_FIT_MARGIN_MM
  const neededHalf = switchClear / 2 + margin

  if (kind === 'square' || kind === 'rect') {
    const tileD = Math.max(baseTileD, switchClear + 2 * margin)
    const tileW = (kind === 'rect' ? 1.12 : 1) * tileD
    return { shapeKind: kind, tileW, tileD, plateShape: null }
  }

  const radius = fitShapeRadius(kind, neededHalf, neededHalf)
  const plateShape = shapeForKind(kind, radius, 1)
  const b = boundsFromShape(plateShape)
  return {
    shapeKind: kind,
    tileW: Math.max(b.width, switchClear + 2 * margin),
    tileD: Math.max(b.height, switchClear + 2 * margin),
    plateShape,
    fitRadius: radius
  }
}

function resolveTileShapeKind(opts, index) {
  const fallback = TILE_BASE_SHAPE_IDS.includes(opts.baseShape) ? opts.baseShape : 'square'
  if (!opts.perLetterShapes) return fallback
  const raw = Array.isArray(opts.letterShapes) ? opts.letterShapes[index] : null
  return TILE_BASE_SHAPE_IDS.includes(raw) ? raw : fallback
}

async function rectTextFootprint(opts) {
  const text = String(opts.text || '').trim()
  if (!text || !opts.fontUrl) {
    return rectFootprint(Number(opts.outerWidthMm) || 35, Number(opts.outerDepthMm) || 35)
  }

  const font = await loadFont(opts.fontUrl)
  const groups = textToLetterShapeGroups(text, font)
  if (!groups.length) return rectFootprint(Number(opts.outerWidthMm) || 35, Number(opts.outerDepthMm) || 35)

  const pocket = Number(opts.housingPocketMm) || 18.5
  const baseTileD = Math.max(22.5, pocket + 4)
  const count = groups.length

  const tileMeta = groups.map((_, i) => {
    const shapeKind = resolveTileShapeKind(opts, i)
    return tileMetaForShapeKind(shapeKind, pocket, baseTileD)
  })

  const rowTileD = Math.max(baseTileD, ...tileMeta.map((t) => t.tileD))
  const snapFit = (
    opts.snapFitEnabled === true
    || opts.keyringLinkEnabled === true
  ) && opts.flexiEnabled !== true && groups.length >= 2
  const gap = opts.flexiEnabled
    ? Math.max(10, rowTileD * 0.44)
    : snapFit
      ? Math.max(11, rowTileD * 0.42)
      : Math.max(1.6, Math.min(3, rowTileD * 0.1))

  let cursor = 0
  const centers = []
  for (let i = 0; i < count; i++) {
    centers.push(cursor + tileMeta[i].tileW / 2)
    cursor += tileMeta[i].tileW + (i < count - 1 ? gap : 0)
  }
  const totalW = cursor
  const offsetX = -totalW / 2

  const plateShapes = []
  const artwork = []
  const switches = []
  const tiles = []
  for (let i = 0; i < count; i++) {
    const cx = centers[i] + offsetX
    const { shapeKind, tileW, tileD, plateShape } = tileMeta[i]
    const tilePlate = plateShape || tileShapeForKind(shapeKind, tileW, tileD)
    const tileArt = fitShapesIntoTile(groups[i].shapes, 0, 0, tileW * 0.54, tileD * 0.58)
    tiles.push({
      plateShapes: [tilePlate],
      shapes: tileArt,
      shapeKind,
      char: groups[i].char,
      tileWidthMm: tileW,
      tileDepthMm: tileD
    })
    plateShapes.push(translateSvgShapes([tilePlate], cx, 0)[0])
    artwork.push(...translateSvgShapes(tileArt, cx, 0))
    switches.push({ x: cx, y: 0, rotation: 0 })
  }

  const bounds = computeBoundsFromShapes(plateShapes)
  const maxDim = Math.max(bounds.width, bounds.height, 1)
  const primaryTileW = tileMeta[0]?.tileW || rowTileD
  const primaryTileD = tileMeta[0]?.tileD || rowTileD

  return {
    plateShapes,
    shapes: artwork,
    bounds,
    artworkBounds: computeBoundsFromShapes(artwork),
    switches,
    capWidthMm: maxDim,
    tileCount: count,
    tileWidthMm: primaryTileW,
    tileDepthMm: primaryTileD,
    tileGapMm: gap,
    snapFitEnabled: snapFit && count >= 2,
    keyringLinkEnabled: snapFit && count >= 2,
    source: 'rect-text-row',
    tiles
  }
}

function offsetBounds(bounds, margin) {
  return {
    minX: bounds.minX - margin,
    maxX: bounds.maxX + margin,
    minY: bounds.minY - margin,
    maxY: bounds.maxY + margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2
  }
}

function resolvePlateShapes(artwork, opts) {
  const margin = Number(opts.imageMarginMm) || 1.2
  const baseShape = opts.baseShape || 'outline'
  const artBounds = artwork.bounds

  if (baseShape === 'outline' || opts.shapeMode === 'rect') {
    if (opts.shapeMode === 'rect') {
      return rectFootprint(
        Number(opts.outerWidthMm) || 35,
        Number(opts.outerDepthMm) || 35
      )
    }
    const padded = offsetBounds(artBounds, margin)
    return {
      shapes: artwork.shapes,
      plateShapes: artwork.shapes,
      bounds: padded,
      artworkBounds: artBounds,
      source: artwork.source
    }
  }

  const halfW = Math.max(artBounds.width / 2 + margin, 8)
  const halfH = Math.max(artBounds.height / 2 + margin, 8)
  const aspect = artBounds.height > 0.01 ? artBounds.width / artBounds.height : 1
  const radius = fitShapeRadius(baseShape, halfW, halfH)
  const plateShape = shapeForKind(baseShape, radius, aspect)
  const bounds = boundsFromShape(plateShape)
  return {
    shapes: artwork.shapes,
    plateShapes: [plateShape],
    bounds,
    artworkBounds: artBounds,
    source: artwork.source
  }
}

/** Resolve bentuk lid & ukuran base dari rect / SVG / teks. */
export async function resolveFootprint(opts) {
  const maxSizeMm = Number(opts.maxSizeMm) || 40
  const mode = opts.shapeMode || 'rect'

  if (mode === 'svg') {
    const raw = String(opts.svgContent || '').trim()
    const hasSerialized = Array.isArray(opts.svgShapes) && opts.svgShapes.length > 0
    if (!raw && !hasSerialized) throw new Error('Unggah file SVG untuk mode bentuk SVG')
    const shapes = hasSerialized ? deserializeShapes(opts.svgShapes) : parseSvgToShapes(raw)
    if (!shapes.length) throw new Error('SVG tidak punya area fill solid')
    const scaled = scaleToMaxSize(shapes, maxSizeMm)
    return resolvePlateShapes({ ...scaled, source: 'svg' }, opts)
  }

  if (mode === 'text') {
    const text = String(opts.text || '').trim()
    if (!text) throw new Error('Isi teks untuk mode bentuk teks')
    if (!opts.fontUrl) throw new Error('Pilih font untuk teks lid')
    const font = await loadFont(opts.fontUrl)
    const shapes = textToShapes(text, font)
    if (!shapes.length) throw new Error('Teks tidak menghasilkan bentuk')
    const scaled = scaleToMaxSize(shapes, maxSizeMm)
    return resolvePlateShapes({ ...scaled, source: 'text' }, opts)
  }

  if (mode === 'mesh') return meshFootprint(opts)

  return rectTextFootprint(opts)
}

/** Vostok-style: body = well + border, well = plate + slip tolerance. */
export function footprintToOuterSize(footprint, opts) {
  const tol = Number(opts.slipToleranceMm) || 0.4
  const border = Number(opts.borderWidthMm) || 2.6
  const pocket = opts.housingPocketMm
  const switchClear = pocket + 3

  let plateW = footprint.bounds.width
  let plateD = footprint.bounds.height
  const minCap = switchClear + 1
  if (Math.min(plateW, plateD) < minCap) {
    const scale = minCap / Math.min(plateW, plateD)
    plateW *= scale
    plateD *= scale
  }

  const wellW = plateW + tol * 2
  const wellD = plateD + tol * 2
  const outerW = wellW + border * 2
  const outerD = wellD + border * 2
  const minOuter = Math.max(outerW, outerD, pocket + border * 2 + tol * 2 + 2)

  return {
    outerWidthMm: Math.max(Number(opts.outerWidthMm) || minOuter, minOuter),
    outerDepthMm: Math.max(Number(opts.outerDepthMm) || minOuter, minOuter),
    plateWidthMm: plateW,
    plateDepthMm: plateD,
    wellWidthMm: wellW,
    wellDepthMm: wellD
  }
}
