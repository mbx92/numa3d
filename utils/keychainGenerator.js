import { createGeneratorWorkerClient } from './generatorWorkerClient.js'
// API generate keychain — offload ke Web Worker agar UI tidak freeze.
import { getKeychainTheme } from './keychainThemes.js'
import { generateKeychainCore } from './keychainCore.js'
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

const workerClient = createGeneratorWorkerClient(
  () => new Worker(new URL('../workers/keychain.worker.js', import.meta.url), { type: 'module' })
)

let nodeWasmPromise = null
async function getNodeWasm() {
  if (!nodeWasmPromise) {
    nodeWasmPromise = (async () => {
      const Module = (await import('manifold-3d')).default
      const wasm = await Module()
      wasm.setup()
      return wasm
    })()
  }
  return nodeWasmPromise
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
      throw new Error('SVG tidak punya bidang atau garis yang terlihat')
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
  if (raw.baseMergedExportGeometry) geos.push(base3mfParts[0].geometry)

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
    getPlate3mfBlob() {
      return new Blob([printGroupsTo3mfBuffer([{ name: 'Base', parts: base3mfParts }, { name: 'Teks', parts: textExportParts }], raw.slug)], { type: 'model/3mf' })
    },
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
          [printGroupsTo3mfBuffer([{ name: 'Base', parts: base3mfParts }], `${raw.slug}_base`)],
          { type: 'model/3mf' }
        )
      }
      return base3mfCache
    },
    getText3mfBlob() {
      if (!text3mfCache) {
        text3mfCache = new Blob(
          [printGroupsTo3mfBuffer([{ name: 'Teks', parts: textExportParts }], `${raw.slug}_text`)],
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

async function generateViaWorker(opts) {
  const prepared = await prepareWorkerOpts(opts)
  const raw = await workerClient.run(prepared)
  return buildLiveResult(raw)
}

export async function generateKeychain(userOpts = {}) {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return generateViaWorker(userOpts)
  }
  const prepared = prepareWorkerOpts(userOpts)
  const raw = await generateKeychainCore(prepared, await getNodeWasm())
  return buildLiveResult(raw)
}
