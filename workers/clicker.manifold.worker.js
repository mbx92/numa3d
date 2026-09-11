// Geometry worker — Manifold WASM kernel (referensi Vostok Labs).
import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { meshBounds, parseMeshBuffer, orientMeshToZUp } from '../utils/clickerManifold/meshImport.js'
import { buildClicker, toPart } from '../utils/clickerManifold/buildClicker.js'
import { buildFlexiClicker, buildSnapFitLinkedClicker } from '../utils/clickerManifold/buildFlexiClicker.js'
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
  // Built-in MX assets already use Z-up and share calibrated assembly heights.
  // Auto-orientation is only for uploaded meshes; it rotates these profiles sideways.
  return meshBufferToSolid(wasm, buf, 'part.3mf', 'z').solid
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
    .map((p) => {
      const isArtwork = p.name === 'top-color-0' || p.name === 'inlay'
      return {
        geometry: packGeometry(partToGeometry(p)),
        color: rgbBytesToHex(p.colorRgb) || colorHex,
        role: group === 'top' ? (isArtwork ? 'letter' : 'lid') : 'base',
        name: p.name || null
      }
    })
}

function makeSwitchPreviewParts(wasm, placements, params, displayMode) {
  if (displayMode === 'print' || !placements?.length) return []
  const previewModel = params.switchPreviewModel || {}
  if (previewModel.hide || previewModel.id === 'hidden') return []
  const { Manifold } = wasm
  const trash = []
  const track = (value) => {
    trash.push(value)
    return value
  }
  const parts = []
  try {
    const bodyW = Math.max(12, Number(params.housingPocketMm || params.preset?.housingOuterMm || 18.5) - 0.4)
    const bodyH = Math.max(8, Number(params.switchDepthMm || params.preset?.bodyDepthMm || 11.5))
    const stemW = Math.max(4.2, Number(params.stemBossMm || params.preset?.stemBossMm || 5.6))
    const stemH = Math.max(2.8, Number(params.stemHeightMm || params.preset?.stemHeightMm || 4.0))
    for (let i = 0; i < placements.length; i++) {
      const sw = placements[i] || {}
      const x = Number(sw.x) || 0
      const y = Number(sw.y) || 0
      const body = track(Manifold.cube([bodyW, bodyW, bodyH], true).translate([x, y, -bodyH / 2]))
      const stem = track(Manifold.cube([stemW, stemW, stemH], true).translate([x, y, stemH / 2]))
      parts.push({
        geometry: packGeometry(partToGeometry(toPart(body, 'preview', 'switch', [63, 70, 82], `switch-body-${i + 1}`))),
        color: '#3f4652',
        role: 'switch',
        name: 'Switch body',
        opacity: 0.38,
        previewOnly: true
      })
      parts.push({
        geometry: packGeometry(partToGeometry(toPart(stem, 'preview', 'switch', [203, 213, 225], `switch-stem-${i + 1}`))),
        color: '#cbd5e1',
        role: 'switch',
        name: 'Switch stem',
        opacity: 0.85,
        previewOnly: true
      })
    }
    return parts
  } finally {
    for (const value of trash.reverse()) {
      try {
        value.delete?.()
      } catch {
        /* already freed */
      }
    }
  }
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
  // The Manifold builder creates the plate and applies its margin. Feed it
  // unpadded artwork for SVG/text, otherwise the margin/shape is applied twice
  // and artwork is scaled relative to an already enlarged plate.
  const plateShapes = ['svg', 'text'].includes(footprint.source)
    ? footprint.shapes
    : buildPlateShapes(footprint, footprintOpts)
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
  const snapFitActive =
    (resolved.snapFitEnabled === true || resolved.keyringLinkEnabled === true)
    && !resolved.flexiEnabled
    && (footprint.tiles?.length || 0) >= 2
  if (resolved.flexiEnabled && (!footprint.tiles?.length || footprint.tiles.length < 2)) {
    throw new Error('Mode flexi butuh minimal 2 huruf yang menghasilkan bentuk')
  }
  if (snapFitActive && (!footprint.tiles?.length || footprint.tiles.length < 2)) {
    throw new Error('Clip kunci snap-fit butuh minimal 2 huruf yang menghasilkan bentuk')
  }
  const splitTiles =
    (resolved.flexiEnabled || snapFitActive)
      ? (footprint.tiles || []).map((tile) => {
          const tilePlateShapes = buildPlateShapes(
            { ...footprint, plateShapes: tile.plateShapes, shapes: tile.shapes || [] },
            { ...footprintOpts, baseShape: 'outline', imageMarginMm: 0 }
          )
          const tileOutlineSegs = adaptiveRingSegments(tilePlateShapes, 64, 128, 0.45)
          const tileOutlineRings = shapesToRings(tilePlateShapes, tileOutlineSegs)
          const tileNorm = ringNormalizeTransform(tileOutlineRings)
          const tileOutline = applyRingTransform(tileOutlineRings, tileNorm)
          const tileArtSegs = adaptiveRingSegments(tile.shapes || [], 48, 96, 0.5)
          const tileArtRingsRaw = shapesToRings(tile.shapes || [], tileArtSegs)
          const tileArtRings = tileArtRingsRaw.length ? applyRingTransform(tileArtRingsRaw, tileNorm) : []
          const tileRegions = tileArtRings.length
            ? [
                {
                  rings: tileArtRings,
                  filamentRgb: hexToRgbBytes(textHex),
                  coverage: 1,
                  partName: 'top-color-0'
                }
              ]
            : []
          return {
            outline: tileOutline,
            regions: tileRegions,
            capWidthMm: Math.max(
              tile.tileWidthMm || 0,
              tile.tileDepthMm || 0,
              footprint.tileWidthMm || 0,
              footprint.tileDepthMm || 0,
              22.5
            )
          }
        })
      : null

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

  const clickerParams = {
    ...resolved,
    ...opts,
    colors,
    flexiEnabled: resolved.flexiEnabled,
    flexiConnectionStyle: resolved.flexiConnectionStyle,
    flexiClearanceMm: resolved.flexiClearanceMm,
    flexiStrapHoleMm: resolved.flexiStrapHoleMm,
    keyringEnabled: resolved.keyringEnabled,
    snapFitEnabled: snapFitActive,
    snapFitClearanceMm: resolved.snapFitClearanceMm,
    keyringLinkEnabled: snapFitActive,
    keyringStyle: resolved.keyringStyle,
    keyringHoleMm: resolved.keyringHoleMm,
    keyringAngleDeg: resolved.keyringAngleDeg,
    keyringTabMm: resolved.keyringTabMm,
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
  }
  let parts
  let warnings
  let flexi = null
  let snapFit = null
  let switchPlacements
  if (splitTiles && resolved.flexiEnabled) {
    ;({ parts, warnings, flexi, switchPlacements } = buildFlexiClicker(
      wasm, socket, stem, splitTiles, clickerParams
    ))
  } else if (splitTiles && snapFitActive) {
    ;({ parts, warnings, snapFit, switchPlacements } = buildSnapFitLinkedClicker(
      wasm, socket, stem, splitTiles, clickerParams
    ))
  } else {
    ;({ parts, warnings, switchPlacements } = buildClicker(
      wasm, socket, stem, regions, outline, clickerParams
    ))
  }
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
  const switchPreviewParts = makeSwitchPreviewParts(wasm, switchPlacements, clickerParams, displayMode)
  const assemblyPreviewParts = [
    ...partsToPreviewParts(placed, 'base', colors.base),
    ...partsToPreviewParts(placed, 'top', lidHex),
    ...switchPreviewParts
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
      flexiJointCount: flexi?.jointCount || 0,
      flexiConnectionStyle: flexi?.connectionStyle || null,
      flexiClearanceMm: flexi?.clearanceMm ? Number(flexi.clearanceMm.toFixed(2)) : null,
      flexiStrapHoleMm: flexi?.strapHoleMm ? Number(flexi.strapHoleMm.toFixed(1)) : null,
      flexiStrapHoleCount: flexi?.strapHoleCount || 0,
      flexiStrapTunnelCount: flexi?.strapTunnelCount || 0,
      snapFitEnabled: !!snapFit?.enabled,
      snapFitLinkCount: snapFit?.linkCount || 0,
      snapFitClearanceMm: snapFit?.clearanceMm ? Number(snapFit.clearanceMm.toFixed(2)) : null,
      snapFitThicknessMm: snapFit?.thicknessMm ? Number(snapFit.thicknessMm.toFixed(2)) : null,
      snapFitGapMm: snapFit?.gapMm ? Number(snapFit.gapMm.toFixed(2)) : null,
      // Legacy aliases
      keyringLinkEnabled: !!snapFit?.enabled,
      keyringLinkCount: snapFit?.linkCount || 0,
      keyringLinkGapMm: snapFit?.gapMm ? Number(snapFit.gapMm.toFixed(2)) : null,
      widthMm: Number((baseGeo.boundingBox.max.x - baseGeo.boundingBox.min.x).toFixed(1)),
      depthMm: Number((baseGeo.boundingBox.max.y - baseGeo.boundingBox.min.y).toFixed(1)),
      heightMm: Number((baseGeo.boundingBox.max.z - baseGeo.boundingBox.min.z).toFixed(1)),
      imageDepthMm: Number((resolved.imageDepthMm ?? 2).toFixed(1))
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
