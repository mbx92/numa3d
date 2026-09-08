// Resolve layer desain lightbox dari image / teks / SVG.
import * as THREE from 'three'
import { parse, Path } from 'opentype.js'
import { opentypePathToShapes } from './opentypeToShapes.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import {
  deserializeShapeLayers,
  deserializeShapes,
  parseSvgToShapeLayers,
  scaleShapes,
  serializeShapeLayers,
  translateSvgShapes
} from './svgToShapes.js'
import { imageToLayers } from './imageToLayers.js'
import { buildInsertPlateFootprint, cloneShapes } from './shapeClipper.js'
import { QR_LIGHTBOX } from './lightboxPresets.js'

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
      })().catch((error) => {
        fontCache.delete(url)
        throw error
      })
    )
  }
  return fontCache.get(url)
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

function scaleToFitBox(shapes, maxWidthMm, maxHeightMm) {
  const bounds = computeBoundsFromShapes(shapes)
  const scale = Math.min(
    maxWidthMm / Math.max(bounds.width, 0.001),
    maxHeightMm / Math.max(bounds.height, 0.001)
  )
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return centerShapes(scaleShapes(shapes, scale, cx, cy))
}

async function resolveQrCaptionShapes(opts, maxWidthMm, maxHeightMm) {
  const caption = String(opts.text || '').trim()
  if (!caption) return null
  if (!opts.fontUrl) throw new Error('Pilih font untuk teks di bawah QR')

  let textShapes
  if (opts.textShapes?.length) {
    textShapes = deserializeShapes(opts.textShapes)
  } else {
    const font = await loadFont(opts.fontUrl)
    textShapes = textToShapes(caption, font)
  }
  if (!textShapes.length) return null
  return scaleToFitBox(textShapes, maxWidthMm, maxHeightMm)
}

function backgroundRect(bounds, paddingMm = 0) {
  const hw = bounds.width / 2 + paddingMm
  const hh = bounds.height / 2 + paddingMm
  const shape = new THREE.Shape()
  shape.moveTo(-hw, -hh)
  shape.lineTo(hw, -hh)
  shape.lineTo(hw, hh)
  shape.lineTo(-hw, hh)
  shape.closePath()
  return [shape]
}

/** Siluet luar dari union SVG + margin (ikuti pola SVG, bukan kotak AABB). */
function outlineFromDesignShapes(shapes, borderMm = 4) {
  const margin = Math.max(0.8, Number(borderMm) || 4)
  // Bridge kecil supaya modul QR/path berdekatan menyatu jadi satu siluet luar
  const bridge = Math.min(1.2, margin * 0.35)
  const { outer } = buildInsertPlateFootprint(shapes, margin, bridge)
  if (outer?.length) return cloneShapes(outer)
  return backgroundRect(computeBoundsFromShapes(shapes), margin)
}

function colorOverride(layerColors, index, fallback) {
  const color = Array.isArray(layerColors) ? layerColors[index] : null
  return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? String(color).toLowerCase() : fallback
}

function applyLayerColorOverrides(layers, layerColors) {
  return (layers || []).map((layer, index) => ({
    ...layer,
    color: colorOverride(layerColors, index, layer.color)
  }))
}

function scaleLayersToMaxSize(layers, maxSizeMm) {
  const allShapes = layers.flatMap((layer) => layer.shapes || [])
  const bounds = computeBoundsFromShapes(allShapes)
  const maxDim = Math.max(bounds.width, bounds.height, 0.001)
  const scale = maxSizeMm / maxDim
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  let scaledLayers = layers.map((layer) => ({
    ...layer,
    shapes: scaleShapes(layer.shapes, scale, cx, cy)
  }))
  const scaledBounds = computeBoundsFromShapes(scaledLayers.flatMap((layer) => layer.shapes || []))
  const dx = -(scaledBounds.minX + scaledBounds.maxX) / 2
  const dy = -(scaledBounds.minY + scaledBounds.maxY) / 2
  scaledLayers = scaledLayers.map((layer) => ({
    ...layer,
    shapes: translateSvgShapes(layer.shapes, dx, dy)
  }))
  const centeredBounds = computeBoundsFromShapes(scaledLayers.flatMap((layer) => layer.shapes || []))
  return { layers: scaledLayers, bounds: centeredBounds }
}


/**
 * Resolve design layers — dipanggil di main thread (image) atau worker (text/svg shapes sudah diserialisasi).
 */
export async function resolveDesignLayers(opts) {
  const mode = opts.designMode || 'text'
  const maxSizeMm = Number(opts.maxSizeMm) || 80
  const colors = opts.colors || {}

  if (mode === 'image') {
    if (opts.imageLayers?.length) {
      const layers = applyLayerColorOverrides(deserializeShapeLayers(opts.imageLayers), opts.layerColors)
      const allShapes = layers.flatMap((l) => l.shapes)
      const bounds = computeBoundsFromShapes(allShapes)
      return {
        layers,
        bounds,
        widthMm: opts.designWidthMm || bounds.width,
        heightMm: opts.designHeightMm || bounds.height
      }
    }
    const dataUrl = String(opts.imageDataUrl || '').trim()
    if (!dataUrl) throw new Error('Unggah gambar untuk mode gambar')
    const result = await imageToLayers(dataUrl, {
      maxColors: opts.maxColors,
      maxSizeMm
    })
    const layers = applyLayerColorOverrides(result.layers, opts.layerColors)
    return {
      layers,
      bounds: result.bounds,
      widthMm: result.widthMm,
      heightMm: result.heightMm
    }
  }

  if (mode === 'svg' || mode === 'svg-qr') {
    let svgLayers
    if (opts.svgLayers?.length) {
      svgLayers = deserializeShapeLayers(opts.svgLayers)
    } else if (opts.svgShapes?.length) {
      svgLayers = [
        {
          index: 0,
          color: colors.text || '#e94560',
          shapes: deserializeShapes(opts.svgShapes),
          isBackground: false
        }
      ]
    } else {
      const raw = String(opts.svgContent || '').trim()
      if (!raw) throw new Error(mode === 'svg-qr' ? 'Unggah SVG QR untuk mode QR' : 'Unggah SVG untuk mode SVG')
      svgLayers = parseSvgToShapeLayers(raw)
    }
    const shapes = svgLayers.flatMap((layer) => layer.shapes || [])
    if (!shapes.length) throw new Error('SVG tidak punya area fill solid')
    const scaled = scaleLayersToMaxSize(svgLayers, maxSizeMm)
    const bgColor = colors.background || '#f5f5f5'
    const colorLayers = applyLayerColorOverrides(scaled.layers, opts.layerColors)
    const designShapes = colorLayers.flatMap((layer) => layer.shapes || [])

    // QR: frame rectangular rapi, safe gap eksplisit, padding bawah untuk stand (+ caption opsional)
    if (mode === 'svg-qr') {
      const safeGap = QR_LIGHTBOX.frameGapMm
      const captionGap = QR_LIGHTBOX.captionGapMm
      const rail = Number(opts.standRailHeightMm) || 0
      const standClearance = Math.max(
        QR_LIGHTBOX.standClearanceMm,
        opts.standEnabled === false || opts.standModelId === 'none' ? safeGap : rail + 4
      )
      const qrBounds = computeBoundsFromShapes(designShapes)
      const captionScaled = await resolveQrCaptionShapes(
        opts,
        qrBounds.width * 0.92,
        Math.min(QR_LIGHTBOX.captionMaxHeightMm, Math.max(5, standClearance * 0.55))
      )
      const captionH = captionScaled?.bounds.height || 0
      const lowerContentH = captionH > 0 ? captionGap + captionH + standClearance : standClearance
      const bandBelowQr = safeGap + lowerContentH
      const widthMm = qrBounds.width + safeGap * 2
      const heightMm = qrBounds.height + safeGap + bandBelowQr
      const panelBounds = {
        minX: -widthMm / 2,
        maxX: widthMm / 2,
        minY: -heightMm / 2,
        maxY: heightMm / 2,
        width: widthMm,
        height: heightMm
      }

      const qrCenterX = (qrBounds.minX + qrBounds.maxX) / 2
      const qrCenterY = (qrBounds.minY + qrBounds.maxY) / 2
      const qrTargetCenterY = panelBounds.minY + bandBelowQr + qrBounds.height / 2
      const shiftedLayers = colorLayers.map((layer) => ({
        ...layer,
        shapes: translateSvgShapes(layer.shapes, -qrCenterX, qrTargetCenterY - qrCenterY),
        isBackground: false
      }))

      const layers = [
        { color: bgColor, shapes: backgroundRect(panelBounds, 0), isBackground: true, name: 'qr_background' },
        ...shiftedLayers
      ]

      if (captionScaled?.shapes?.length) {
        const captionCenterY = panelBounds.minY + safeGap + standClearance + captionH / 2
        const fgColor = colors.text || '#111827'
        layers.push({
          color: fgColor,
          shapes: translateSvgShapes(captionScaled.shapes, 0, captionCenterY),
          isBackground: false,
          name: 'qr_caption'
        })
      }

      return {
        layers,
        followOutline: false,
        qrMode: true,
        qrFrameGapMm: safeGap,
        qrStandClearanceMm: standClearance,
        bounds: panelBounds,
        widthMm,
        heightMm
      }
    }

    const borderMm = Number(opts.borderMm) || 4
    const outerShapes = outlineFromDesignShapes(designShapes, borderMm)
    const outerBounds = computeBoundsFromShapes(outerShapes)
    return {
      layers: [
        { color: bgColor, shapes: outerShapes, isBackground: true, name: 'svg_outline' },
        ...colorLayers.map((layer) => ({ ...layer, isBackground: false }))
      ],
      outerShapes,
      followOutline: true,
      bounds: outerBounds,
      widthMm: outerBounds.width,
      heightMm: outerBounds.height
    }
  }

  // text mode
  const text = String(opts.text || '').trim()
  if (!text) throw new Error('Isi teks untuk mode teks')
  if (!opts.fontUrl) throw new Error('Pilih font untuk teks')

  let textShapes
  if (opts.textShapes?.length) {
    textShapes = deserializeShapes(opts.textShapes)
  } else {
    const font = await loadFont(opts.fontUrl)
    textShapes = textToShapes(text, font)
  }
  if (!textShapes.length) throw new Error('Teks tidak menghasilkan bentuk')

  const scaled = scaleToMaxSize(textShapes, maxSizeMm)
  const bgColor = colors.background || '#f5f5f5'
  const fgColor = colors.text || '#e94560'
  const bgShapes = backgroundRect(scaled.bounds, 3)
  return {
    layers: [
      { color: bgColor, shapes: bgShapes, isBackground: true },
      { color: fgColor, shapes: scaled.shapes, isBackground: false }
    ],
    bounds: computeBoundsFromShapes([...bgShapes, ...scaled.shapes]),
    widthMm: scaled.bounds.width + 6,
    heightMm: scaled.bounds.height + 6
  }
}

export function serializeDesignLayers(layers) {
  return serializeShapeLayers(layers)
}

export function computeOuterSize(designWidthMm, designHeightMm, opts) {
  const rawBorder = Number(opts.borderMm)
  const border = Number.isFinite(rawBorder) ? Math.max(rawBorder, 0) : 4
  const wall = Number(opts.wallThicknessMm) || 2
  const minW = designWidthMm + border * 2 + wall * 2
  const minD = designHeightMm + border * 2 + wall * 2
  return {
    outerWidthMm: Math.max(Number(opts.outerWidthMm) || minW, minW),
    outerDepthMm: Math.max(Number(opts.outerDepthMm) || minD, minD)
  }
}
