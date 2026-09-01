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
  return { shapes: [shape], plateShapes: [shape], bounds, source: 'rect' }
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
    if (!raw) throw new Error('Unggah file SVG untuk mode bentuk SVG')
    let shapes = opts.svgShapes?.length ? deserializeShapes(opts.svgShapes) : parseSvgToShapes(raw)
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

  return rectFootprint(Number(opts.outerWidthMm) || 35, Number(opts.outerDepthMm) || 35)
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
