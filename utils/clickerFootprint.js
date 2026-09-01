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
  return { shapes: [shape], bounds, source: 'rect' }
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
    return { ...scaled, source: 'svg' }
  }

  if (mode === 'text') {
    const text = String(opts.text || '').trim()
    if (!text) throw new Error('Isi teks untuk mode bentuk teks')
    if (!opts.fontUrl) throw new Error('Pilih font untuk teks lid')
    const font = await loadFont(opts.fontUrl)
    const shapes = textToShapes(text, font)
    if (!shapes.length) throw new Error('Teks tidak menghasilkan bentuk')
    const scaled = scaleToMaxSize(shapes, maxSizeMm)
    return { ...scaled, source: 'text' }
  }

  const widthMm = Number(opts.outerWidthMm) || 34
  const depthMm = Number(opts.outerDepthMm) || 34
  return rectFootprint(widthMm, depthMm)
}

export function footprintToOuterSize(footprint, opts) {
  const pad = Number(opts.bodyPaddingMm) || 4
  const wall = Number(opts.wallThicknessMm) || 2.5
  const pocket = opts.housingPocketMm
  const minW = footprint.bounds.width + pad * 2 + wall * 2
  const minD = footprint.bounds.height + pad * 2 + wall * 2
  const minOuter = Math.max(minW, minD, pocket + wall * 2 + pad * 2)
  return {
    outerWidthMm: Math.max(Number(opts.outerWidthMm) || minOuter, minOuter),
    outerDepthMm: Math.max(Number(opts.outerDepthMm) || minOuter, minOuter)
  }
}
