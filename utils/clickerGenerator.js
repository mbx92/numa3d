import { createGeneratorWorkerClient, GeneratorWorkerError } from './generatorWorkerClient.js'
// API generate clicker — offload ke Web Worker agar UI tidak freeze.
import { generateClickerCore } from './clickerCore.js'
import { unpackGeometry } from './geometryPack.js'
import { parseSvgToShapes, serializeShapes } from './svgToShapes.js'
import {
  EXPORT_FORMATS,
  exportFilename,
  exportMime,
  printGroupsTo3mfBuffer,
  partsToColoredStlBuffer,
  partsToGlbBuffer,
  partsToMultiSolidStlBuffer
} from './keychainExport.js'

const workerClient = createGeneratorWorkerClient(
  () => new Worker(new URL('../workers/clicker.worker.js', import.meta.url), { type: 'module' })
)

const manifoldClient = createGeneratorWorkerClient(
  () => new Worker(new URL('../workers/clicker.manifold.worker.js', import.meta.url), { type: 'module' }),
  {
    async initialize(worker, signal) {
      const [socket, stem] = await Promise.all(['mx-socket', 'mx-stem'].map(async (name) => {
        const response = await fetch(`/assets/clicker/mx/${name}.3mf`, { signal })
        if (!response.ok) throw new Error(`${name}.3mf tidak ditemukan`)
        return response.arrayBuffer()
      }))
      if (!signal.aborted) worker.postMessage({ type: 'init', socket, stem }, [socket, stem])
    }
  }
)

function mapPreviewPart(p, geos) {
  const geometry = p.geometry ? unpackGeometry(p.geometry) : null
  if (geometry) geos.push(geometry)
  const name = p.role === 'switch' ? 'Switch' : null
  return {
    geometry,
    modelUrl: p.modelUrl || null,
    modelNodeNames: p.modelNodeNames || null,
    modelFitMm: p.modelFitMm,
    modelTopZ: p.modelTopZ,
    modelMinZ: p.modelMinZ,
    modelAxis: p.modelAxis || null,
    position: p.position || null,
    rotationZ: p.rotationZ,
    color: p.color,
    line: !!p.line,
    role: p.role || null,
    name,
    opacity: p.opacity,
    previewOnly: !!p.previewOnly
  }
}

function exportParts(parts) {
  return parts.filter((p) => !p.previewOnly && !p.line && p.geometry?.attributes?.position?.count)
}

function cloneWorkerOpts(opts) {
  const cloneValue = (value) => {
    if (value == null) return value
    if (value instanceof ArrayBuffer) return value.slice(0)
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    }
    if (Array.isArray(value)) return value.map(cloneValue)
    if (typeof value === 'object') {
      const out = {}
      for (const key of Object.keys(value)) out[key] = cloneValue(value[key])
      return out
    }
    return value
  }
  return cloneValue(opts ?? {})
}

function prepareWorkerOpts(opts) {
  const cloned = cloneWorkerOpts(opts)
  const svgContent = String(cloned.svgContent || '').trim()
  if (svgContent) {
    const shapes = parseSvgToShapes(svgContent)
    if (!shapes.length) throw new Error('SVG tidak punya area fill — gunakan logo solid')
    cloned.svgShapes = serializeShapes(shapes)
    delete cloned.svgContent
  }
  return cloned
}

function buildLiveResult(raw) {
  const geos = []
  const basePreviewParts = raw.basePreviewParts.map((p) => mapPreviewPart(p, geos))
  const lidPreviewParts = (raw.lidPreviewParts || raw.accentPreviewParts || []).map((p) =>
    mapPreviewPart(p, geos)
  )
  const assemblyPreviewParts = (raw.assemblyPreviewParts || []).map((p) => mapPreviewPart(p, geos))

  const baseExportParts = exportParts(basePreviewParts)
  const lidExportParts = exportParts(lidPreviewParts)
  const base3mfParts = raw.baseMergedExportGeometry
    ? [
        {
          geometry: unpackGeometry(raw.baseMergedExportGeometry),
          color: raw.baseMergedExportColor,
          role: 'base',
          name: 'base'
        }
      ]
    : baseExportParts
  if (raw.baseMergedExportGeometry) geos.push(base3mfParts[0].geometry)

  let baseBlobCache = null
  let baseColorStlCache = null
  let baseMultiStlCache = null
  let base3mfCache = null
  let baseGlbCache = null
  let lidBlobCache = null
  let lidColorStlCache = null
  let lidMultiStlCache = null
  let lid3mfCache = null
  let lidGlbCache = null
  const lidStlBuffer = raw.lidStlBuffer || raw.accentStlBuffer

  return {
    slug: raw.slug,
    getPlate3mfBlob() {
      return new Blob([printGroupsTo3mfBuffer([{ name: 'Base', parts: base3mfParts }, { name: 'Lid', parts: lidExportParts, faceDown: raw.shapeMode !== 'mesh' }], raw.slug)], { type: 'model/3mf' })
    },
    warnings: raw.warnings || [],
    shapeMode: raw.shapeMode,
    displayMode: raw.displayMode,
    switchPresetId: raw.switchPresetId,
    switchPresetName: raw.switchPresetName,
    baseFilename: raw.baseFilename,
    lidFilename: raw.lidFilename || raw.accentFilename,
    accentFilename: raw.lidFilename || raw.accentFilename,
    basePreviewColor: raw.basePreviewColor,
    basePreviewParts,
    lidPreviewParts,
    accentPreviewParts: lidPreviewParts,
    assemblyPreviewParts,
    baseExportParts,
    lidExportParts,
    accentExportParts: lidExportParts,
    dimensions: raw.dimensions,
    getBaseBlob() {
      if (!baseBlobCache) baseBlobCache = new Blob([raw.baseStlBuffer], { type: 'model/stl' })
      return baseBlobCache
    },
    getLidBlob() {
      if (!lidStlBuffer) return null
      if (!lidBlobCache) lidBlobCache = new Blob([lidStlBuffer], { type: 'model/stl' })
      return lidBlobCache
    },
    getAccentBlob() {
      return this.getLidBlob()
    },
    getBaseColoredStlBlob() {
      if (!baseColorStlCache) {
        baseColorStlCache = new Blob([partsToColoredStlBuffer(baseExportParts)], { type: 'model/stl' })
      }
      return baseColorStlCache
    },
    getLidColoredStlBlob() {
      if (!lidExportParts.length) return null
      if (!lidColorStlCache) {
        lidColorStlCache = new Blob([partsToColoredStlBuffer(lidExportParts)], { type: 'model/stl' })
      }
      return lidColorStlCache
    },
    getAccentColoredStlBlob() {
      return this.getLidColoredStlBlob()
    },
    getBaseMultiStlBlob() {
      if (!baseMultiStlCache) {
        baseMultiStlCache = new Blob([partsToMultiSolidStlBuffer(baseExportParts)], { type: 'model/stl' })
      }
      return baseMultiStlCache
    },
    getLidMultiStlBlob() {
      if (!lidExportParts.length) return null
      if (!lidMultiStlCache) {
        lidMultiStlCache = new Blob([partsToMultiSolidStlBuffer(lidExportParts)], { type: 'model/stl' })
      }
      return lidMultiStlCache
    },
    getAccentMultiStlBlob() {
      return this.getLidMultiStlBlob()
    },
    getBase3mfBlob() {
      if (!base3mfCache) {
        base3mfCache = new Blob(
          [printGroupsTo3mfBuffer([{ name: 'Base', parts: base3mfParts }], `${raw.slug}_base`)],
          { type: 'model/3mf' }
        )
      }
      return base3mfCache
    },
    getLid3mfBlob() {
      if (!lidExportParts.length) return null
      if (!lid3mfCache) {
        lid3mfCache = new Blob(
          [printGroupsTo3mfBuffer([{ name: 'Lid', parts: lidExportParts, faceDown: raw.shapeMode !== 'mesh' }], `${raw.slug}_lid`)],
          { type: 'model/3mf' }
        )
      }
      return lid3mfCache
    },
    getAccent3mfBlob() {
      return this.getLid3mfBlob()
    },
    async getBaseGlbBlob() {
      if (!baseGlbCache) {
        baseGlbCache = new Blob([await partsToGlbBuffer(baseExportParts)], { type: 'model/gltf-binary' })
      }
      return baseGlbCache
    },
    async getLidGlbBlob() {
      if (!lidExportParts.length) return null
      if (!lidGlbCache) {
        lidGlbCache = new Blob([await partsToGlbBuffer(lidExportParts)], { type: 'model/gltf-binary' })
      }
      return lidGlbCache
    },
    async getAccentGlbBlob() {
      return this.getLidGlbBlob()
    },
    dispose() {
      for (const g of geos) g.dispose()
    }
  }
}

async function generateViaManifoldWorker(prepared) {
  const transfer = ['meshBuffer', 'meshLidBuffer', 'meshBaseBuffer']
    .map((key) => prepared[key]).filter((buffer) => buffer instanceof ArrayBuffer)
  const raw = await manifoldClient.run(prepared, transfer)
  return buildLiveResult(raw)
}

async function generateViaWorker(opts) {
  const prepared = await prepareWorkerOpts(opts)
  const raw = await workerClient.run(prepared)
  return buildLiveResult(raw)
}

export async function generateClicker(userOpts = {}) {
  const glyphCount = Array.from(String(userOpts.text || '')).filter((ch) => ch.trim()).length
  const snapFitNeedsManifold =
    userOpts.shapeMode === 'rect'
    && userOpts.flexiEnabled !== true
    && (userOpts.snapFitEnabled === true || userOpts.keyringLinkEnabled === true)
    && glyphCount >= 2
  const requiresManifold =
    userOpts.shapeMode === 'mesh'
    || (userOpts.shapeMode === 'rect' && userOpts.flexiEnabled === true)
    || snapFitNeedsManifold
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    const prepared = prepareWorkerOpts(userOpts)
    try {
      return await generateViaManifoldWorker(prepared)
    } catch (e) {
      if (requiresManifold || !(e instanceof GeneratorWorkerError)) throw e
      console.warn('[clicker] Manifold fallback ke clipper:', e?.message || e)
    }
  }
  if (requiresManifold) {
    throw new Error(
      userOpts.shapeMode === 'mesh'
        ? 'Mode mesh membutuhkan Manifold worker'
        : snapFitNeedsManifold && !(userOpts.shapeMode === 'rect' && userOpts.flexiEnabled === true)
        ? 'Clip kunci snap-fit antar huruf membutuhkan Manifold worker'
        : 'Mode flexi membutuhkan Manifold worker agar engsel print-in-place ikut dibuat'
    )
  }
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return generateViaWorker(userOpts)
  }
  const raw = await generateClickerCore(prepareWorkerOpts(userOpts))
  return buildLiveResult(raw)
}
