// Geometry worker — Manifold WASM kernel (referensi Vostok Labs).
import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { meshBounds, parseMeshBuffer, orientMeshToZUp } from '../utils/clickerManifold/meshImport.js'
import { buildClicker } from '../utils/clickerManifold/buildClicker.js'
import {
  adaptiveRingSegments,
  applyRingTransform,
  hexToRgbBytes,
  meshToStlArrayBuffer,
  partToGeometry,
  partsToGeometries,
  ringNormalizeTransform,
  rgbBytesToHex,
  shapesToRings
} from '../utils/clickerManifold/meshUtils.js'
import { packGeometry } from '../utils/geometryPack.js'
import { resolveFootprint } from '../utils/clickerFootprint.js'
import { resolveClickerOptions } from '../utils/clickerPresets.js'
import { buildPlateShapes } from '../utils/clickerShapes.js'

let modulePromise = null
let socket = null
let stem = null

async function getModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const wasm = await Module({ locateFile: () => wasmUrl })
      wasm.setup()
      // Finer default arcs on extrude/revolve — smoother cavity walls.
      if (typeof wasm.setMinCircularEdgeLength === 'function') wasm.setMinCircularEdgeLength(0.25)
      return wasm
    })()
  }
  return modulePromise
}

function rawToSolid(wasm, raw) {
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: raw.vertProperties,
    triVerts: raw.triVerts
  })
  mesh.merge()
  return wasm.Manifold.ofMesh(mesh)
}

function meshBufferToSolid(wasm, buf, filename = '', upAxis = 'auto') {
  const parsed = parseMeshBuffer(buf, filename)
  const { raw } = orientMeshToZUp(parsed, upAxis)
  return { raw, solid: rawToSolid(wasm, raw) }
}

function assetToSolid(wasm, buf) {
  return meshBufferToSolid(wasm, buf, 'part.3mf').solid
}

function resolveMeshTransform(raw, footprint, opts) {
  const bounds = footprint.mesh?.bounds || meshBounds(raw)
  const scaleXY = Number(footprint.mesh?.scale) || (Number(opts.maxSizeMm) || 40) / Math.max(bounds.width, bounds.depth, 0.001)
  const sourceH = Math.max(bounds.height, 0.001)
  const maxHeight = Math.max(4, Number(opts.meshReliefHeightMm) || 35)
  const proportionalHeight = sourceH * scaleXY
  const scaleZ = proportionalHeight > maxHeight ? maxHeight / sourceH : scaleXY
  return {
    scaleX: scaleXY,
    scaleY: scaleXY,
    scaleZ,
    translateX: -bounds.centerX * scaleXY,
    translateY: -bounds.centerY * scaleXY,
    translateZ: -bounds.minZ * scaleZ - 0.05,
    targetHeightMm: sourceH * scaleZ
  }
}

function slugify(text) {
  return (
    String(text || 'clicker')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 32) || 'clicker'
  )
}

function partsToPreviewParts(parts, group, colorHex) {
  return parts
    .filter((p) => p.group === group)
    .map((p) => ({
      geometry: packGeometry(partToGeometry(p)),
      color: rgbBytesToHex(p.colorRgb) || colorHex,
      role: group === 'top' ? 'lid' : 'base'
    }))
}

function applyPlateLayout(parts, displayMode) {
  if (displayMode !== 'print') return parts

  const GAP = 5
  let minZ = Infinity
  for (const p of parts) {
    const vp = p.vertProperties
    const np = p.numProp || 3
    for (let i = 2; i < vp.length; i += np) {
      if (vp[i] < minZ) minZ = vp[i]
    }
  }
  if (!isFinite(minZ)) minZ = 0

  const bbox = (group) => {
    let b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
    for (const p of parts) {
      if (p.group !== group) continue
      const vp = p.vertProperties
      const np = p.numProp || 3
      for (let i = 0; i < vp.length; i += np) {
        const x = vp[i]
        const y = vp[i + 1]
        const z = vp[i + 2] - minZ
        b.minX = Math.min(b.minX, x)
        b.maxX = Math.max(b.maxX, x)
        b.minY = Math.min(b.minY, y)
        b.maxY = Math.max(b.maxY, y)
        b.minZ = Math.min(b.minZ, z)
        b.maxZ = Math.max(b.maxZ, z)
      }
    }
    return b
  }

  const baseBB = bbox('base')
  const topBB = bbox('top')
  const baseW = baseBB.maxX - baseBB.minX
  const topW = topBB.maxX - topBB.minX
  const baseCX = (baseBB.minX + baseBB.maxX) / 2
  const topCX = (topBB.minX + topBB.maxX) / 2

  return parts.map((p) => {
    const vp = new Float32Array(p.vertProperties)
    const np = p.numProp || 3
    for (let i = 0; i < vp.length; i += np) {
      let x = vp[i]
      let y = vp[i + 1]
      let z = vp[i + 2] - minZ
      if (p.group === 'base') {
        z -= baseBB.minZ
      } else if (p.group === 'top') {
        z -= topBB.minZ
        x = x + (baseCX + baseW / 2 + GAP + topW / 2 - topCX)
      }
      vp[i] = x
      vp[i + 1] = y
      vp[i + 2] = z
    }
    return { ...p, vertProperties: vp }
  })
}

function transformAssembly(parts, displayMode) {
  if (displayMode === 'print') return applyPlateLayout(parts, displayMode)
  if (displayMode !== 'exploded') return parts

  let maxZ = -Infinity
  for (const p of parts) {
    if (p.group !== 'top') continue
    const vp = p.vertProperties
    const np = p.numProp || 3
    for (let i = 2; i < vp.length; i += np) maxZ = Math.max(maxZ, vp[i])
  }
  const lift = 12
  return parts.map((p) => {
    if (p.group !== 'top') return p
    const vp = new Float32Array(p.vertProperties)
    const np = p.numProp || 3
    for (let i = 2; i < vp.length; i += np) vp[i] += lift
    return { ...p, vertProperties: vp }
  })
}

async function buildFromOpts(opts) {
  const resolved = resolveClickerOptions(opts)
  const footprintOpts = { ...resolved, ...opts, baseShape: resolved.baseShape }
  if (opts.meshBaseBuffer instanceof ArrayBuffer && !(opts.meshBuffer instanceof ArrayBuffer)) {
    footprintOpts.meshBuffer = opts.meshBaseBuffer
    footprintOpts.meshFilename = opts.meshBaseFilename || opts.meshFilename || 'base.stl'
  }
  footprintOpts.meshUpAxis = opts.meshUpAxis || 'auto'
  const footprint = await resolveFootprint(footprintOpts)
  const plateShapes = buildPlateShapes(footprint, footprintOpts)
  const outlineSegs = adaptiveRingSegments(plateShapes, 64, 128, 0.45)
  const outlineRings = shapesToRings(plateShapes, outlineSegs)
  const norm = ringNormalizeTransform(outlineRings)
  const outline = applyRingTransform(outlineRings, norm)

  const artSegs = adaptiveRingSegments(footprint.shapes || plateShapes, 48, 96, 0.5)
  const artRingsRaw = shapesToRings(footprint.shapes || [], artSegs)
  const artRings = artRingsRaw.length ? applyRingTransform(artRingsRaw, norm) : []
  const colors = resolved.colors
  const lidHex = colors.lid || '#f5a623'
  const textHex = colors.text || colors.accent || lidHex
  const regions = artRings.length
    ? [
        {
          rings: artRings,
          filamentRgb: hexToRgbBytes(textHex),
          coverage: 1,
          partName: 'top-color-0'
        }
      ]
    : []

  const wasm = await getModule()
  if (!socket || !stem) throw new Error('Manifold assets belum diinisialisasi')
  let meshSolid = null
  let meshTransform = null
  let meshLidSolid = null
  let meshBaseSolid = null
  let meshWarnings = []
  const meshSplitLidRatio = Math.max(0, Math.min(0.75, Number(opts.meshSplitLidRatio) || 0))
  const meshUpAxis = opts.meshUpAxis || 'auto'
  const meshSplitRegionRaw = opts.meshSplitRegion && typeof opts.meshSplitRegion === 'object' ? opts.meshSplitRegion : {}
  const meshSplitRegion = {
    u: Math.max(0, Math.min(1, Number(meshSplitRegionRaw.u) || 0.5)),
    v: Math.max(0, Math.min(1, Number(meshSplitRegionRaw.v) || 0.5)),
    wu: Math.max(0.02, Math.min(1, Number(meshSplitRegionRaw.wu) || 1)),
    wv: Math.max(0.02, Math.min(1, Number(meshSplitRegionRaw.wv) || 1))
  }
  const hasDualMesh =
    opts.shapeMode === 'mesh' &&
    opts.meshLidBuffer instanceof ArrayBuffer &&
    opts.meshBaseBuffer instanceof ArrayBuffer

  if (opts.shapeMode === 'mesh') {
    if (hasDualMesh) {
      const lidMesh = meshBufferToSolid(wasm, opts.meshLidBuffer, opts.meshLidFilename || 'lid.stl', meshUpAxis)
      const baseMesh = meshBufferToSolid(wasm, opts.meshBaseBuffer, opts.meshBaseFilename || 'base.stl', meshUpAxis)
      meshLidSolid = lidMesh.solid
      meshBaseSolid = baseMesh.solid
      // Transform dari footprint (pakai base untuk skala XY)
      meshTransform = resolveMeshTransform(baseMesh.raw, footprint, opts)
      meshSolid = baseMesh.solid
      const tri =
        lidMesh.raw.triVerts.length / 3 + baseMesh.raw.triVerts.length / 3
      if (tri > 80000) {
        meshWarnings = ['Mesh cukup berat; jika preview lambat, gunakan model yang sudah disederhanakan.']
      }
    } else {
      if (!(opts.meshBuffer instanceof ArrayBuffer)) {
        throw new Error('Pilih file mesh (.3mf / .stl) untuk mode Mesh')
      }
      const mesh = meshBufferToSolid(wasm, opts.meshBuffer, opts.meshFilename || '', meshUpAxis)
      meshSolid = mesh.solid
      meshTransform = resolveMeshTransform(mesh.raw, footprint, opts)
      const triangleCount = mesh.raw.triVerts.length / 3
      if (triangleCount > 80000) {
        meshWarnings = ['Mesh cukup berat; jika preview lambat, gunakan model yang sudah disederhanakan.']
      }
    }
  }

  const { parts, warnings } = buildClicker(wasm, socket, stem, regions, outline, {
    ...resolved,
    ...opts,
    colors,
    baseShape: footprint.source === 'rect-text-row' ? 'outline' : resolved.baseShape,
    imageMarginMm: footprint.source === 'rect-text-row' ? 0 : resolved.imageMarginMm,
    imageMargin: footprint.source === 'rect-text-row' ? 0 : resolved.imageMarginMm,
    outlineSmoothingRadius: footprint.source === 'rect-text-row' ? 0.35 : undefined,
    maxSizeMm: footprint.capWidthMm || resolved.maxSizeMm,
    capWidthMm: footprint.capWidthMm || resolved.maxSizeMm,
    switches: footprint.switches || opts.switches || resolved.switches,
    baseFilamentRgb: hexToRgbBytes(lidHex),
    bodyColorRgb: hexToRgbBytes(colors.base),
    meshSolid,
    meshLidSolid,
    meshBaseSolid,
    meshTransform,
    meshSplitLidRatio: hasDualMesh ? 0 : meshSplitLidRatio,
    meshSplitRegion,
    meshStemBuryMm: Math.max(0.8, Math.min(6, Number(opts.meshStemBuryMm) || 2.5)),
    meshAsTop: opts.shapeMode === 'mesh' && !hasDualMesh && meshSplitLidRatio <= 0.05
  })
  meshSolid?.delete?.()
  if (meshLidSolid && meshLidSolid !== meshSolid) meshLidSolid.delete?.()
  if (meshBaseSolid && meshBaseSolid !== meshSolid) meshBaseSolid.delete?.()

  const displayMode = opts.displayMode || 'preview'
  const placed = transformAssembly(parts, displayMode)

  const baseGeo = partsToGeometries(parts, 'base')
  const lidGeo = partsToGeometries(parts, 'top')
  if (!baseGeo || !lidGeo) throw new Error('Geometry Manifold kosong')
  baseGeo.computeBoundingBox()
  lidGeo.computeBoundingBox()

  const lidPreviewParts = partsToPreviewParts(parts, 'top', lidHex)
  const basePreviewParts = partsToPreviewParts(parts, 'base', colors.base)
  const assemblyPreviewParts = [
    ...partsToPreviewParts(placed, 'base', colors.base),
    ...partsToPreviewParts(placed, 'top', lidHex)
  ]
  const slug = slugify(opts.label || opts.text)

  return {
    slug,
    warnings: [...meshWarnings, ...warnings],
    shapeMode: opts.shapeMode,
    baseShape: resolved.baseShape,
    displayMode,
    switchPresetId: resolved.switchPresetId,
    switchPresetName: resolved.preset.name,
    baseFilename: `${slug}_base.stl`,
    lidFilename: `${slug}_lid.stl`,
    accentFilename: `${slug}_lid.stl`,
    basePreviewColor: colors.base,
    dimensions: {
      engine: 'manifold',
      tileCount: footprint.tileCount || 1,
      tileWidthMm: footprint.tileWidthMm ? Number(footprint.tileWidthMm.toFixed(1)) : null,
      tileDepthMm: footprint.tileDepthMm ? Number(footprint.tileDepthMm.toFixed(1)) : null,
      tileGapMm: footprint.tileGapMm ? Number(footprint.tileGapMm.toFixed(1)) : null,
      widthMm: Number((baseGeo.boundingBox.max.x - baseGeo.boundingBox.min.x).toFixed(1)),
      depthMm: Number((baseGeo.boundingBox.max.y - baseGeo.boundingBox.min.y).toFixed(1)),
      heightMm: Number((baseGeo.boundingBox.max.z - baseGeo.boundingBox.min.z).toFixed(1))
    },
    basePreviewParts: basePreviewParts.length
      ? basePreviewParts
      : [{ geometry: packGeometry(baseGeo), color: colors.base, role: 'base' }],
    lidPreviewParts: lidPreviewParts.length
      ? lidPreviewParts
      : [{ geometry: packGeometry(lidGeo), color: lidHex, role: 'lid' }],
    accentPreviewParts: lidPreviewParts.length
      ? lidPreviewParts
      : [{ geometry: packGeometry(lidGeo), color: lidHex, role: 'lid' }],
    assemblyPreviewParts: assemblyPreviewParts.length
      ? assemblyPreviewParts
      : [
          { geometry: packGeometry(baseGeo.clone()), color: colors.base },
          { geometry: packGeometry(lidGeo.clone()), color: lidHex }
        ],
    baseMergedExportGeometry: packGeometry(baseGeo.clone()),
    baseMergedExportColor: colors.base,
    baseStlBuffer: meshToStlArrayBuffer(baseGeo),
    lidStlBuffer: meshToStlArrayBuffer(lidGeo),
    accentStlBuffer: meshToStlArrayBuffer(lidGeo)
  }
}

self.onmessage = async (event) => {
  const data = event.data || {}

  if (data.type === 'init') {
    try {
      const wasm = await getModule()
      socket?.delete?.()
      stem?.delete?.()
      const a = assetToSolid(wasm, data.socket)
      const b = assetToSolid(wasm, data.stem)
      const sbb = a.boundingBox()
      const scx = (sbb.min[0] + sbb.max[0]) / 2
      const scy = (sbb.min[1] + sbb.max[1]) / 2
      socket = a.translate([-scx, -scy, -sbb.max[2]])
      const tbb = b.boundingBox()
      const tcx = (tbb.min[0] + tbb.max[0]) / 2
      const tcy = (tbb.min[1] + tbb.max[1]) / 2
      stem = b.translate([-tcx, -tcy, 0])
      a.delete()
      b.delete()
      self.postMessage({ type: 'initDone' })
    } catch (e) {
      self.postMessage({ type: 'error', message: e?.message || 'Init Manifold gagal' })
    }
    return
  }

  if (data.id != null) {
    try {
      const result = await buildFromOpts(data.opts || {})
      const transfer = []
      const add = (buf) => {
        if (buf?.buffer) transfer.push(buf.buffer)
      }
      add(result.baseStlBuffer)
      add(result.lidStlBuffer)
      for (const key of ['basePreviewParts', 'lidPreviewParts', 'assemblyPreviewParts']) {
        for (const p of result[key] || []) {
          add(p.geometry?.positions)
          add(p.geometry?.normals)
        }
      }
      add(result.baseMergedExportGeometry?.positions)
      add(result.baseMergedExportGeometry?.normals)
      self.postMessage({ id: data.id, result }, transfer)
    } catch (e) {
      self.postMessage({ id: data.id, error: e?.message || 'Generate Manifold gagal' })
    }
  }
}

self.postMessage({ type: 'ready' })
