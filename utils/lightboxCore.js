// Logika generate lightbox — face multi-layer + frame + back (konsep MakerWorld Lightbox Maker).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { resolveLightboxOptions, validateLightboxSize } from './lightboxPresets.js'
import { computeOuterSize, resolveDesignLayers } from './lightboxFootprint.js'
import { subtractShapes2D } from './shapeClipper.js'

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
    String(text || 'lightbox')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 32) || 'lightbox'
  )
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
  if (!shapes?.length || depth <= 0.01) return null
  const parts = shapes.map((shape) => new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, depth }))
  return mergeParts(parts)
}

function solidBox(w, d, h, x, y, z) {
  const geo = new THREE.BoxGeometry(w, d, h)
  geo.translate(x, y, z)
  return geo
}

function roundedRectShape(hw, hd, r) {
  const radius = Math.min(r, hw, hd)
  const shape = new THREE.Shape()
  shape.moveTo(-hw + radius, -hd)
  shape.lineTo(hw - radius, -hd)
  shape.quadraticCurveTo(hw, -hd, hw, -hd + radius)
  shape.lineTo(hw, hd - radius)
  shape.quadraticCurveTo(hw, hd, hw - radius, hd)
  shape.lineTo(-hw + radius, hd)
  shape.quadraticCurveTo(-hw, hd, -hw, hd - radius)
  shape.lineTo(-hw, -hd + radius)
  shape.quadraticCurveTo(-hw, -hd, -hw + radius, -hd)
  shape.closePath()
  return shape
}

/** Lubang silinder horizontal pada panel belakang. */
function horizontalHoleRing(outer, inner, length, x, y, z, axis = 'x') {
  const t = (outer - inner) / 2
  if (t <= 0.05) return []
  if (axis === 'x') {
    return [
      solidBox(length, outer, t, x, y + (inner + t) / 2, z),
      solidBox(length, outer, t, x, y - (inner + t) / 2, z),
      solidBox(length, t, inner, x, y, z + (inner + t) / 2),
      solidBox(length, t, inner, x, y, z - (inner + t) / 2)
    ]
  }
  return [
    solidBox(outer, length, t, x + (inner + t) / 2, y, z),
    solidBox(outer, length, t, x - (inner + t) / 2, y, z),
    solidBox(t, length, inner, x, y, z + (inner + t) / 2),
    solidBox(t, length, inner, x, y, z - (inner + t) / 2)
  ]
}

function buildFaceLayers(design, opts, zStart) {
  const parts = []
  const backDepth = opts.backLayerDepthMm
  const colorDepth = opts.colorLayerDepthMm
  let z = zStart

  for (const layer of design.layers) {
    const depth = layer.isBackground ? backDepth : colorDepth
    const geo = extrudeShapes(layer.shapes, depth)
    if (!geo) continue
    geo.translate(0, 0, z)
    const color = layer.color || (layer.isBackground ? opts.colors.background : opts.colors.text)
    parts.push({ geometry: geo, color, role: layer.isBackground ? 'background' : 'color' })
    z += depth
  }
  return { parts, totalDepth: z - zStart }
}

function buildFrameBody(opts, outerW, outerD) {
  const hw = outerW / 2
  const hd = outerD / 2
  const wall = opts.wallThicknessMm
  const backPanel = opts.backPanelMm
  const cavity = opts.backCavityDepthMm
  const totalH = backPanel + cavity + wall
  const parts = []

  const outerShape = roundedRectShape(hw, hd, opts.cornerRadiusMm)
  const innerHw = hw - wall
  const innerHd = hd - wall
  const innerShape = roundedRectShape(innerHw, innerHd, Math.max(0, opts.cornerRadiusMm - wall))

  const ringShapes = subtractShapes2D([outerShape], [innerShape])
  const wallGeo = extrudeShapes(ringShapes, totalH - backPanel)
  if (wallGeo) {
    wallGeo.translate(0, 0, backPanel)
    parts.push({ geometry: wallGeo, color: opts.colors.frame, role: 'frame' })
  }

  const backGeo = extrudeShapes([outerShape], backPanel)
  if (backGeo) {
    backGeo.translate(0, 0, backPanel / 2)
    parts.push({ geometry: backGeo, color: opts.colors.back, role: 'back' })
  }

  if (opts.cableHoleMm > 0) {
    const holeD = opts.cableHoleMm
    const holeOuter = holeD + 1.2
    const side = opts.cableHoleSide || 'bottom'
    let holeParts = []

    if (side === 'bottom') {
      holeParts = horizontalHoleRing(holeOuter, holeD, outerW * 0.6, 0, -hd + wall * 0.5, backPanel / 2, 'x')
    } else if (side === 'left') {
      holeParts = horizontalHoleRing(holeOuter, holeD, outerD * 0.5, -hw + wall * 0.5, 0, backPanel / 2, 'y')
    } else if (side === 'right') {
      holeParts = horizontalHoleRing(holeOuter, holeD, outerD * 0.5, hw - wall * 0.5, 0, backPanel / 2, 'y')
    } else {
      const cx = 0
      const cy = 0
      const ring = []
      const segments = 12
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2
        const a1 = ((i + 1) / segments) * Math.PI * 2
        const r0 = holeD / 2
        const r1 = holeOuter / 2
        const x0 = cx + Math.cos(a0) * r1
        const y0 = cy + Math.sin(a0) * r1
        const x1 = cx + Math.cos(a1) * r1
        const y1 = cy + Math.sin(a1) * r1
        ring.push(solidBox(Math.hypot(x1 - x0, y1 - y0) || 0.5, holeOuter, backPanel + 0.1, (x0 + x1) / 2, (y0 + y1) / 2, backPanel / 2))
      }
      holeParts = ring
    }

    for (const hp of holeParts) {
      parts.push({ geometry: hp, color: opts.colors.back, role: 'cableHole' })
    }
  }

  return { parts, totalH }
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

export async function generateLightboxCore(userOpts = {}) {
  const opts = resolveLightboxOptions(userOpts)
  const design = await resolveDesignLayers(opts)

  const outer = computeOuterSize(design.widthMm, design.heightMm, opts)
  opts.outerWidthMm = outer.outerWidthMm
  opts.outerDepthMm = outer.outerDepthMm
  validateLightboxSize(opts, { width: design.widthMm, height: design.heightMm })

  const frame = buildFrameBody(opts, opts.outerWidthMm, opts.outerDepthMm)
  const faceZ = frame.totalH
  const face = buildFaceLayers(design, opts, faceZ)

  const facePreviewParts = face.parts
  const bodyPreviewParts = frame.parts
  const assemblyPreviewParts = [...bodyPreviewParts, ...facePreviewParts]

  const faceGeos = facePreviewParts.map((p) => p.geometry)
  const bodyGeos = bodyPreviewParts.map((p) => p.geometry)
  const faceMerged = mergeParts(faceGeos.map((g) => g.clone()))
  const bodyMerged = mergeParts(bodyGeos.map((g) => g.clone()))

  const faceMesh = new THREE.Mesh(faceMerged, new THREE.MeshStandardMaterial())
  const bodyMesh = new THREE.Mesh(bodyMerged, new THREE.MeshStandardMaterial())
  const slug = slugify(opts.label || opts.text)

  const totalHeight = frame.totalH + face.totalDepth

  const result = {
    slug,
    designMode: opts.designMode,
    baseFilename: `${slug}_face.stl`,
    bodyFilename: `${slug}_body.stl`,
    accentFilename: `${slug}_face.stl`,
    lidFilename: `${slug}_face.stl`,
    basePreviewColor: opts.colors.background,
    dimensions: {
      widthMm: Number(opts.outerWidthMm.toFixed(1)),
      depthMm: Number(opts.outerDepthMm.toFixed(1)),
      heightMm: Number(totalHeight.toFixed(1)),
      faceDepthMm: Number(face.totalDepth.toFixed(1)),
      cavityDepthMm: Number(opts.backCavityDepthMm.toFixed(1)),
      designWidthMm: Number(design.widthMm.toFixed(1)),
      designHeightMm: Number(design.heightMm.toFixed(1)),
      layerCount: design.layers.length
    },
    facePreviewParts: facePreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    bodyPreviewParts: bodyPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    basePreviewParts: facePreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    lidPreviewParts: bodyPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    accentPreviewParts: facePreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color,
      role: p.role || null
    })),
    assemblyPreviewParts: assemblyPreviewParts.map((p) => ({
      geometry: packGeometry(p.geometry),
      color: p.color
    })),
    baseMergedExportGeometry: null,
    baseStlBuffer: meshToStlArrayBuffer(faceMesh),
    lidStlBuffer: meshToStlArrayBuffer(bodyMesh),
    accentStlBuffer: meshToStlArrayBuffer(faceMesh),
    bodyStlBuffer: meshToStlArrayBuffer(bodyMesh)
  }

  faceMesh.geometry.dispose()
  bodyMesh.geometry.dispose()
  faceGeos.forEach((g) => g.dispose())
  bodyGeos.forEach((g) => g.dispose())

  return result
}
