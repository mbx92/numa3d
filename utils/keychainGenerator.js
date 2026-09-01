// API generate keychain — offload ke Web Worker agar UI tidak freeze.
import { getKeychainTheme } from './keychainThemes.js'
import { generateKeychainCore, resolveInsertFit, unpackGeometry } from './keychainCore.js'
import { resolveEyeletLayout } from './shapeClipper.js'

export { resolveInsertFit, resolveEyeletLayout }

const defaultTheme = getKeychainTheme('sharen77')
export const KEYCHAIN_DEFAULTS = {
  themeId: defaultTheme.id,
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
  return { geometry, color: p.color, line: !!p.line }
}

function buildLiveResult(raw) {
  const geos = []
  const basePreviewParts = raw.basePreviewParts.map((p) => mapPreviewPart(p, geos))
  const textPreviewParts = raw.textPreviewParts.map((p) => mapPreviewPart(p, geos))
  const assemblyPreviewParts = (raw.assemblyPreviewParts || []).map((p) => mapPreviewPart(p, geos))

  let baseBlobCache = null
  let textBlobCache = null

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
    dimensions: raw.dimensions,
    getBaseBlob() {
      if (!baseBlobCache) baseBlobCache = new Blob([raw.baseStlBuffer], { type: 'model/stl' })
      return baseBlobCache
    },
    getTextBlob() {
      if (!textBlobCache) textBlobCache = new Blob([raw.textStlBuffer], { type: 'model/stl' })
      return textBlobCache
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
        const handler = (event) => {
          if (event.data?.id !== id) return
          w.removeEventListener('message', handler)
          if (event.data.error) reject(new Error(event.data.error))
          else resolve(buildLiveResult(event.data.result))
        }
        w.addEventListener('message', handler)
        w.postMessage({ id, opts })
      })
  )
}

export async function generateKeychain(userOpts = {}) {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      return await generateViaWorker(userOpts)
    } catch {
      // fallback sync di main thread
    }
  }
  const raw = await generateKeychainCore(userOpts)
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
