// API generate keychain — offload ke Web Worker agar UI tidak freeze.
import { getKeychainTheme } from './keychainThemes.js'
import { generateKeychainCore } from './keychainCore.js'
import { unpackGeometry } from './geometryPack.js'
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

const defaultTheme = getKeychainTheme('sharen77')
export const KEYCHAIN_DEFAULTS = {
  themeId: defaultTheme.id,
  fontUrl: defaultTheme.fontUrl,
  typographyId: defaultTheme.typographyId || 'straight',
  svgContent: '',
  svgSizeMm: 14,
  svgGapMm: 2,
  ...defaultTheme.defaults
}

export const ATTACHMENT_TYPES = [
  { id: 'hole', label: 'Eyelet (lubang)', description: 'Ring bulat menyatu di kiri — seperti referensi SHAREN 77' },
  { id: 'hook', label: 'Hook kait', description: 'Kait C terbuka — langsung diklip ke ring/bar' }
]

let worker = null
let workerReady = null

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('../workers/keychain.worker.js', import.meta.url), { type: 'module' })
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

/** Worker postMessage butuh plain object — bukan Vue reactive proxy. */
function cloneWorkerOpts(opts) {
  return JSON.parse(JSON.stringify(opts ?? {}))
}

function prepareWorkerOpts(opts) {
  const cloned = cloneWorkerOpts(opts)
  const svgContent = String(cloned.svgContent || '').trim()
  if (svgContent) {
    const shapes = parseSvgToShapes(svgContent)
    if (!shapes.length) {
      throw new Error('SVG tidak punya area fill — gunakan logo solid (bukan hanya garis)')
    }
    cloned.svgShapes = serializeShapes(shapes)
    delete cloned.svgContent
  }
  return cloned
}

function buildLiveResult(raw) {
  const geos = []
  const basePreviewParts = raw.basePreviewParts.map((p) => mapPreviewPart(p, geos))
  const textPreviewParts = raw.textPreviewParts.map((p) => mapPreviewPart(p, geos))
  const assemblyPreviewParts = (raw.assemblyPreviewParts || []).map((p) => mapPreviewPart(p, geos))

  const baseExportParts = exportParts(basePreviewParts)
  const textExportParts = exportParts(textPreviewParts)
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
  let textBlobCache = null
  let baseColorStlCache = null
  let textColorStlCache = null
  let baseMultiStlCache = null
  let textMultiStlCache = null
  let base3mfCache = null
  let text3mfCache = null
  let baseGlbCache = null
  let textGlbCache = null

  return {
    slug: raw.slug,
    themeId: raw.themeId,
    themeName: raw.themeName,
    attachmentType: raw.attachmentType,
    baseFilename: raw.baseFilename,
    textFilename: raw.textFilename,
    basePreviewColor: raw.basePreviewColor,
    basePreviewParts,
    textPreviewParts,
    assemblyPreviewParts,
    baseExportParts,
    textExportParts,
    dimensions: raw.dimensions,
    getBaseBlob() {
      if (!baseBlobCache) baseBlobCache = new Blob([raw.baseStlBuffer], { type: 'model/stl' })
      return baseBlobCache
    },
    getTextBlob() {
      if (!textBlobCache) textBlobCache = new Blob([raw.textStlBuffer], { type: 'model/stl' })
      return textBlobCache
    },
    getBaseColoredStlBlob() {
      if (!baseColorStlCache) {
        baseColorStlCache = new Blob([partsToColoredStlBuffer(baseExportParts)], { type: 'model/stl' })
      }
      return baseColorStlCache
    },
    getTextColoredStlBlob() {
      if (!textColorStlCache) {
        textColorStlCache = new Blob([partsToColoredStlBuffer(textExportParts)], { type: 'model/stl' })
      }
      return textColorStlCache
    },
    getBaseMultiStlBlob() {
      if (!baseMultiStlCache) {
        baseMultiStlCache = new Blob([partsToMultiSolidStlBuffer(baseExportParts)], { type: 'model/stl' })
      }
      return baseMultiStlCache
    },
    getTextMultiStlBlob() {
      if (!textMultiStlCache) {
        textMultiStlCache = new Blob([partsToMultiSolidStlBuffer(textExportParts)], { type: 'model/stl' })
      }
      return textMultiStlCache
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
    getText3mfBlob() {
      if (!text3mfCache) {
        text3mfCache = new Blob(
          [partsTo3mfBuffer(textExportParts, `${raw.slug}_text`, { assembly: true })],
          { type: 'model/3mf' }
        )
      }
      return text3mfCache
    },
    async getBaseGlbBlob() {
      if (!baseGlbCache) {
        baseGlbCache = new Blob([await partsToGlbBuffer(baseExportParts)], { type: 'model/gltf-binary' })
      }
      return baseGlbCache
    },
    async getTextGlbBlob() {
      if (!textGlbCache) {
        textGlbCache = new Blob([await partsToGlbBuffer(textExportParts)], { type: 'model/gltf-binary' })
      }
      return textGlbCache
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

export async function generateKeychain(userOpts = {}) {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return generateViaWorker(userOpts)
  }
  const prepared = prepareWorkerOpts(userOpts)
  const raw = await generateKeychainCore(prepared)
  return buildLiveResult(raw)
}
