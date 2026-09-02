import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { getAttachmentReach } from './shapeClipper.js'

const MAX_SVG_BYTES = 256 * 1024

export function readSvgFile(file) {
  if (!file) return Promise.reject(new Error('File tidak dipilih'))
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
    return Promise.reject(new Error('Hanya file .svg yang didukung'))
  }
  if (file.size > MAX_SVG_BYTES) {
    return Promise.reject(new Error('SVG terlalu besar (maks. 256 KB)'))
  }
  return file.text()
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
export function flipShapesY(shapes) {
  if (!shapes?.length) return shapes
  const bounds = computeBoundsFromShapes(shapes)
  const flipBase = bounds.minY + bounds.maxY
  return shapes.map((shape) =>
    mapShapePoints(shape, (x, y) => ({
      x,
      y: flipBase - y
    }))
  )
}

/** Parse SVG string → array THREE.Shape (fill path). Butuh DOMParser (main thread). */
export function parseSvgToShapes(svgString) {
  const raw = String(svgString || '').trim()
  if (!raw) return []
  if (typeof DOMParser === 'undefined') {
    throw new Error('Parsing SVG hanya tersedia di browser — coba refresh halaman')
  }

  const loader = new SVGLoader()
  const { paths } = loader.parse(raw)
  const shapes = []

  for (const path of paths) {
    const fill = path.userData?.style?.fill
    const stroke = path.userData?.style?.stroke
    if ((!fill || fill === 'none') && (!stroke || stroke === 'none')) continue
    const pathShapes = path.toShapes(true)
    for (const shape of pathShapes) {
      if (shape.getPoints(4).length >= 3) shapes.push(shape)
    }
  }

  return flipShapesY(shapes)
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
    throw new Error('SVG tidak punya area fill — gunakan logo solid (bukan hanya garis)')
  }

  let working = shapes
  const bounds = computeBoundsFromShapes(working)
  const { cx, cy } = boundsCenter(bounds)
  const sizeMm = Number(opts.svgSizeMm) || 14
  const maxDim = Math.max(bounds.width, bounds.height, 0.001)
  working = scaleShapes(working, sizeMm / maxDim, cx, cy)

  let scaled = computeBoundsFromShapes(working)
  const gap = Number(opts.svgGapMm) || 2

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
