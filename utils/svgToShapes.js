import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { getAttachmentReach } from './shapeClipper.js'
import { svgFillShapes, svgStrokeShapes } from './svgPathGeometry.js'
import { expandSvgReferences } from './svgReferences.js'

const MAX_SVG_BYTES = 1024 * 1024

/** Buang <image> / data-URI raster — generator hanya pakai path vektor. */
export function stripSvgRasterImages(svgString) {
  const raw = String(svgString || '')
  if (!raw) return { svg: '', stripped: false, beforeBytes: 0, afterBytes: 0 }
  const beforeBytes = new TextEncoder().encode(raw).length
  // Self-closing or paired <image> with optional huge data: href
  const cleaned = raw
    .replace(/<image\b[^>]*\/>/gi, '')
    .replace(/<image\b[^>]*>[\s\S]*?<\/image>/gi, '')
  const afterBytes = new TextEncoder().encode(cleaned).length
  return {
    svg: cleaned,
    stripped: afterBytes < beforeBytes,
    beforeBytes,
    afterBytes
  }
}

export function readSvgFile(file) {
  if (!file) return Promise.reject(new Error('File tidak dipilih'))
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
    return Promise.reject(new Error('Hanya file .svg yang didukung'))
  }
  if (file.size > MAX_SVG_BYTES) {
    return Promise.reject(new Error('SVG terlalu besar (maks. 1 MB)'))
  }
  return file.text().then((text) => {
    const { svg, stripped, beforeBytes, afterBytes } = stripSvgRasterImages(text)
    if (!String(svg).trim() || !parseSvgToShapes(svg).length) {
      throw new Error('SVG tidak punya path vektor — gambar tertanam tidak didukung')
    }
    // Simpan metadata ringan di string via property? Return plain string for callers.
    // Callers expect string — attach non-enumerable hint if needed later.
    if (stripped && beforeBytes - afterBytes > 8 * 1024) {
      console.info(
        `[svg] Dibuang gambar tertanam ${(beforeBytes / 1024).toFixed(0)} KB → ${(afterBytes / 1024).toFixed(0)} KB`
      )
    }
    return svg
  })
}

function mapShapePoints(shape, fn) {
  const pts = shape.getPoints(12)
  const next = new THREE.Shape()
  pts.forEach((p, i) => {
    const tp = fn(p.x, p.y)
    if (i === 0) next.moveTo(tp.x, tp.y)
    else next.lineTo(tp.x, tp.y)
  })
  next.closePath()
  for (const hole of shape.holes || []) {
    const hp = hole.getPoints(12)
    const ring = new THREE.Path()
    hp.forEach((p, i) => {
      const tp = fn(p.x, p.y)
      if (i === 0) ring.moveTo(tp.x, tp.y)
      else ring.lineTo(tp.x, tp.y)
    })
    ring.closePath()
    next.holes.push(ring)
  }
  return next
}

export function scaleShapes(shapes, scale, cx, cy) {
  return shapes.map((shape) =>
    mapShapePoints(shape, (x, y) => ({
      x: cx + (x - cx) * scale,
      y: cy + (y - cy) * scale
    }))
  )
}

export function translateSvgShapes(shapes, dx, dy) {
  return shapes.map((shape) =>
    mapShapePoints(shape, (x, y) => ({
      x: x + dx,
      y: y + dy
    }))
  )
}

/** SVG (Y ke bawah) → footprint 3D (Y ke atas), mirror vertikal di sekitar bbox. */
export function flipShapesY(shapes, referenceBounds = null) {
  if (!shapes?.length) return shapes
  const bounds = referenceBounds || computeBoundsFromShapes(shapes)
  const flipBase = bounds.minY + bounds.maxY
  return shapes.map((shape) =>
    mapShapePoints(shape, (x, y) => ({
      x,
      y: flipBase - y
    }))
  )
}

function normalizeSvgColor(value, fallback = '#111827') {
  const raw = String(value || '').trim()
  if (!raw || raw === 'none' || raw === 'transparent' || raw === 'currentColor') return fallback
  try {
    return `#${new THREE.Color().setStyle(raw).getHexString()}`
  } catch {
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return `#${raw
        .slice(1)
        .split('')
        .map((ch) => ch + ch)
        .join('')}`.toLowerCase()
    }
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase()
    return fallback
  }
}

/** Parse SVG string → layer warna per fill path. Butuh DOMParser (main thread). */
export function parseSvgToShapeLayers(svgString) {
  const raw = String(svgString || '').trim()
  if (!raw) return []
  if (typeof DOMParser === 'undefined') {
    throw new Error('Parsing SVG hanya tersedia di browser — coba refresh halaman')
  }

  const xml = new DOMParser().parseFromString(raw, 'image/svg+xml')
  if (xml.querySelector('parsererror') || xml.documentElement?.localName !== 'svg') {
    throw new Error('File SVG tidak valid — ekspor ulang sebagai SVG dari aplikasi desain')
  }
  const normalized = expandSvgReferences(xml)
  if ([...xml.querySelectorAll('text')].some((node) => !node.closest('defs, symbol') && node.textContent.trim())) {
    throw new Error('Ubah teks di SVG menjadi path/outline di aplikasi desain sebelum diunggah')
  }
  const loader = new SVGLoader()
  const { paths } = loader.parse(normalized)
  const grouped = new Map()

  const add = (paint, shapes) => {
    if (!shapes.length) return
    const color = normalizeSvgColor(paint)
    const current = grouped.get(color) || []
    current.push(...shapes)
    grouped.set(color, current)
  }

  for (const path of paths) {
    const style = path.userData?.style || {}
    let hidden = style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === 0
    for (let node = path.userData?.node; node; node = node.parentElement) {
      if (['defs', 'clipPath', 'mask', 'symbol', 'pattern'].includes(node.localName)
        || node.getAttribute('display') === 'none' || node.style?.display === 'none'
        || node.getAttribute('opacity') === '0' || node.style?.opacity === '0') hidden = true
    }
    if (hidden) continue
    for (let node = path.userData?.node; node; node = node.parentElement) {
      for (const feature of ['clip-path', 'mask', 'stroke-dasharray']) {
        const value = node.style?.getPropertyValue(feature) || node.getAttribute(feature)
        if (value && value !== 'none') {
          throw new Error(`SVG memakai ${feature} — terapkan/flatten efek dan ubah stroke menjadi path di aplikasi desain terlebih dahulu`)
        }
      }
    }
    const painted = (value) => value && value !== 'none' && value !== 'transparent'
    if (painted(style.fill) && style.fillOpacity !== 0) add(style.fill, svgFillShapes(path))
    if (painted(style.stroke) && style.strokeOpacity !== 0 && style.strokeWidth > 0) add(style.stroke, svgStrokeShapes(path))
  }

  // All colours share one SVG coordinate frame; flipping each colour around
  // its own bbox moves separate parts of a logo relative to one another.
  const bounds = computeBoundsFromShapes([...grouped.values()].flat())
  return [...grouped.entries()].map(([color, shapes], index) => ({
    index,
    color,
    shapes: flipShapesY(shapes, bounds),
    isBackground: false
  }))
}

/** Parse SVG string → array THREE.Shape (fill path). Butuh DOMParser (main thread). */
export function parseSvgToShapes(svgString) {
  const layers = parseSvgToShapeLayers(svgString)
  return layers.flatMap((layer) => layer.shapes)
}

export function serializeShapeLayers(layers) {
  return (layers || []).map((layer, index) => ({
    index: layer.index ?? index,
    color: layer.color,
    isBackground: !!layer.isBackground,
    shapes: serializeShapes(layer.shapes)
  }))
}

export function deserializeShapeLayers(data) {
  if (!Array.isArray(data) || !data.length) return []
  return data.map((layer, index) => ({
    index: layer.index ?? index,
    color: layer.color,
    isBackground: !!layer.isBackground,
    shapes: deserializeShapes(layer.shapes)
  }))
}

export function serializeShapes(shapes) {
  return shapes.map((shape) => ({
    points: shape.getPoints(12).map((p) => [p.x, p.y]),
    holes: (shape.holes || []).map((hole) => hole.getPoints(12).map((p) => [p.x, p.y]))
  }))
}

export function deserializeShapes(data) {
  if (!Array.isArray(data) || !data.length) return []
  return data.map(({ points, holes }) => {
    const shape = new THREE.Shape()
    points.forEach((p, i) => {
      if (i === 0) shape.moveTo(p[0], p[1])
      else shape.lineTo(p[0], p[1])
    })
    shape.closePath()
    for (const hp of holes || []) {
      const ring = new THREE.Path()
      hp.forEach((p, i) => {
        if (i === 0) ring.moveTo(p[0], p[1])
        else ring.lineTo(p[0], p[1])
      })
      ring.closePath()
      shape.holes.push(ring)
    }
    return shape
  })
}

function boundsCenter(bounds) {
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2
  }
}

/** Skala & posisikan logo dari shapes 2D — aman di worker. */
export function buildLogoGroupFromShapes(shapes, opts, textBounds = null) {
  if (!shapes?.length) {
    throw new Error('SVG tidak punya bidang atau garis yang terlihat')
  }

  let working = shapes
  const bounds = computeBoundsFromShapes(working)
  const { cx, cy } = boundsCenter(bounds)
  const sizeMm = Number(opts.svgSizeMm) || 14
  const maxDim = Math.max(bounds.width, bounds.height)
  if (!Number.isFinite(maxDim) || maxDim <= 0) throw new Error('Ukuran bidang SVG tidak valid')
  working = scaleShapes(working, sizeMm / maxDim, cx, cy)

  let scaled = computeBoundsFromShapes(working)
  const gap = Math.max(0, Number(opts.svgGapMm ?? 2))

  let dx
  let dy
  if (textBounds) {
    dx = textBounds.minX - gap - scaled.maxX
    dy = (textBounds.minY + textBounds.maxY) / 2 - (scaled.minY + scaled.maxY) / 2
  } else {
    const attachReach = getAttachmentReach(opts)
    const pad = Number(opts.paddingMm) || 1.8
    const targetW = Number(opts.targetWidthMm) || 68
    const targetH = Number(opts.targetHeightMm) || 21
    const fitScale = Math.min(targetW / scaled.width, targetH / scaled.height, 1)
    if (fitScale < 0.999) {
      const c2 = boundsCenter(scaled)
      working = scaleShapes(working, fitScale, c2.cx, c2.cy)
      scaled = computeBoundsFromShapes(working)
    }
    dx = attachReach + pad - scaled.minX
    dy = -(scaled.minY + scaled.maxY) / 2
  }

  working = translateSvgShapes(working, dx, dy)
  return { char: 'logo', shapes: working, logo: true }
}

/** Parse SVG di main thread lalu bangun group logo. */
export function createLogoGroup(svgContent, opts, textBounds = null) {
  const shapes = parseSvgToShapes(svgContent)
  return buildLogoGroupFromShapes(shapes, opts, textBounds)
}
