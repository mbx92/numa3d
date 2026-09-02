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
import {
  boundsFromShape,
  fitShapeRadius,
  makeRoundedRectShape,
  shapeForKind
} from './clickerBaseShapes.js'

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

function tileShapeForKind(kind, tileW, tileD) {
  const shapeKind = !kind || kind === 'outline' ? 'square' : kind
  if (shapeKind === 'square') return makeRoundedRectShape(tileW / 2, tileD / 2, Math.min(tileW, tileD) * 0.18)
  if (shapeKind === 'rect') return makeRoundedRectShape(tileW / 2, tileD / 2, Math.min(tileW, tileD) * 0.18)
  const radius = Math.min(tileW, tileD) / 2
  return shapeForKind(shapeKind, radius, tileW / tileD)
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
  const tileD = Math.max(22.5, pocket + 4)
  const tileW = (opts.baseShape === 'rect' ? 1.12 : 1) * tileD
  const gap = Math.max(1.6, Math.min(3, tileD * 0.1))
  const pitch = tileW + gap
  const count = groups.length
  const startX = -((count - 1) * pitch) / 2
  const shapeKind = opts.baseShape || 'square'

  const plateShapes = []
  const artwork = []
  const switches = []
  for (let i = 0; i < count; i++) {
    const cx = startX + i * pitch
    plateShapes.push(translateSvgShapes([tileShapeForKind(shapeKind, tileW, tileD)], cx, 0)[0])
    artwork.push(...fitShapesIntoTile(groups[i].shapes, cx, 0, tileW * 0.54, tileD * 0.58))
    switches.push({ x: cx, y: 0, rotation: 0 })
  }

  const bounds = computeBoundsFromShapes(plateShapes)
  const maxDim = Math.max(bounds.width, bounds.height, 1)

  return {
    plateShapes,
    shapes: artwork,
    bounds,
    artworkBounds: computeBoundsFromShapes(artwork),
    switches,
    capWidthMm: maxDim,
    tileCount: count,
    tileWidthMm: tileW,
    tileDepthMm: tileD,
    tileGapMm: gap,
    source: 'rect-text-row'
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
