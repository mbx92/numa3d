// API generate clicker — offload ke Web Worker agar UI tidak freeze.
import { generateClickerCore, unpackGeometry } from './clickerCore.js'
import { parseSvgToShapes, serializeShapes } from './svgToShapes.js'
import {
  EXPORT_FORMATS,
  exportFilename,
  exportMime,
  partsTo3mfBuffer,
  partsToColoredStlBuffer,
  partsToGlbBuffer,
  partsToMultiSolidStlBuffer
} from './keychainExport.js'

let worker = null
let workerReady = null

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('../workers/clicker.worker.js', import.meta.url), { type: 'module' })
    workerReady = new Promise((resolve, reject) => {
      worker.onerror = (e) => reject(e.error || new Error('Worker error'))
      resolve()
    })
  }
  return worker
}

function mapPreviewPart(p, geos) {
  const geometry = unpackGeometry(p.geometry)
  geos.push(geometry)
  return { geometry, color: p.color, line: !!p.line, role: p.role || null, name: p.role || null }
}

function exportParts(parts) {
  return parts.filter((p) => !p.line && p.geometry?.attributes?.position?.count)
}

function cloneWorkerOpts(opts) {
  return JSON.parse(JSON.stringify(opts ?? {}))
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
          [partsTo3mfBuffer(base3mfParts, `${raw.slug}_base`, { assembly: false })],
          { type: 'model/3mf' }
        )
      }
      return base3mfCache
    },
    getLid3mfBlob() {
      if (!lidExportParts.length) return null
      if (!lid3mfCache) {
        lid3mfCache = new Blob(
          [partsTo3mfBuffer(lidExportParts, `${raw.slug}_lid`, { assembly: true })],
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

function generateViaWorker(opts) {
  const w = getWorker()
  const id = Math.random().toString(36).slice(2)
  return workerReady.then(
    () =>
      new Promise((resolve, reject) => {
        let prepared
        try {
          prepared = prepareWorkerOpts(opts)
        } catch (e) {
          reject(e)
          return
        }
        const handler = (event) => {
          if (event.data?.id !== id) return
          w.removeEventListener('message', handler)
          if (event.data.error) reject(new Error(event.data.error))
          else resolve(buildLiveResult(event.data.result))
        }
        w.addEventListener('message', handler)
        w.postMessage({ id, opts: prepared })
      })
  )
}

export async function generateClicker(userOpts = {}) {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return generateViaWorker(userOpts)
  }
  const raw = await generateClickerCore(prepareWorkerOpts(userOpts))
  return buildLiveResult(raw)
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
