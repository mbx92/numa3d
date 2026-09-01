// API generate lightbox — offload ke Web Worker agar UI tidak freeze.

import { generateLightboxCore } from './lightboxCore.js'
import { unpackGeometry } from './geometryPack.js'

import { parseSvgToShapes, serializeShapes } from './svgToShapes.js'

import { imageToLayers } from './imageToLayers.js'

import { serializeDesignLayers } from './lightboxFootprint.js'

import { LIGHTBOX_DEFAULTS } from './lightboxPresets.js'

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

    worker = new Worker(new URL('../workers/lightbox.worker.js', import.meta.url), { type: 'module' })

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



async function prepareWorkerOpts(opts) {

  const cloned = cloneWorkerOpts(opts)

  const mode = cloned.designMode || 'text'



  if (mode === 'image') {

    const dataUrl = String(cloned.imageDataUrl || '').trim()

    if (!dataUrl) throw new Error('Unggah gambar untuk mode gambar')

    const result = await imageToLayers(dataUrl, {

      maxColors: cloned.maxColors,

      maxSizeMm: cloned.maxSizeMm

    })

    cloned.imageLayers = serializeDesignLayers(result.layers)

    cloned.designWidthMm = result.widthMm

    cloned.designHeightMm = result.heightMm

    delete cloned.imageDataUrl

  }



  if (mode === 'svg') {

    const svgContent = String(cloned.svgContent || '').trim()

    if (svgContent) {

      const shapes = parseSvgToShapes(svgContent)

      if (!shapes.length) throw new Error('SVG tidak punya area fill solid')

      cloned.svgShapes = serializeShapes(shapes)

      delete cloned.svgContent

    }

  }



  return cloned

}



function buildLiveResult(raw) {

  const geos = []

  const facePreviewParts = (raw.facePreviewParts || raw.basePreviewParts || []).map((p) =>

    mapPreviewPart(p, geos)

  )

  const bodyPreviewParts = (raw.bodyPreviewParts || raw.lidPreviewParts || []).map((p) =>

    mapPreviewPart(p, geos)

  )

  const assemblyPreviewParts = (raw.assemblyPreviewParts || []).map((p) => mapPreviewPart(p, geos))



  const faceExportParts = exportParts(facePreviewParts)

  const bodyExportParts = exportParts(bodyPreviewParts)



  let faceBlobCache = null

  let bodyBlobCache = null

  let faceColorStlCache = null

  let bodyColorStlCache = null

  let faceMultiStlCache = null

  let bodyMultiStlCache = null

  let face3mfCache = null

  let body3mfCache = null

  let faceGlbCache = null

  let bodyGlbCache = null

  let assembly3mfCache = null

  let assemblyGlbCache = null



  const bodyStlBuffer = raw.bodyStlBuffer || raw.lidStlBuffer



  return {

    slug: raw.slug,

    designMode: raw.designMode,

    baseFilename: raw.baseFilename,

    bodyFilename: raw.bodyFilename,

    lidFilename: raw.baseFilename,

    accentFilename: raw.baseFilename,

    basePreviewColor: raw.basePreviewColor,

    facePreviewParts,

    bodyPreviewParts,

    basePreviewParts: facePreviewParts,

    lidPreviewParts: bodyPreviewParts,

    accentPreviewParts: facePreviewParts,

    assemblyPreviewParts,

    faceExportParts,

    bodyExportParts,

    baseExportParts: faceExportParts,

    lidExportParts: bodyExportParts,

    accentExportParts: faceExportParts,

    dimensions: raw.dimensions,

    getFaceBlob() {

      if (!faceBlobCache) faceBlobCache = new Blob([raw.baseStlBuffer], { type: 'model/stl' })

      return faceBlobCache

    },

    getBodyBlob() {

      if (!bodyStlBuffer) return null

      if (!bodyBlobCache) bodyBlobCache = new Blob([bodyStlBuffer], { type: 'model/stl' })

      return bodyBlobCache

    },

    getBaseBlob() {

      return this.getFaceBlob()

    },

    getLidBlob() {

      return this.getBodyBlob()

    },

    getAccentBlob() {

      return this.getFaceBlob()

    },

    getFaceColoredStlBlob() {

      if (!faceColorStlCache) {

        faceColorStlCache = new Blob([partsToColoredStlBuffer(faceExportParts)], { type: 'model/stl' })

      }

      return faceColorStlCache

    },

    getBodyColoredStlBlob() {

      if (!bodyExportParts.length) return null

      if (!bodyColorStlCache) {

        bodyColorStlCache = new Blob([partsToColoredStlBuffer(bodyExportParts)], { type: 'model/stl' })

      }

      return bodyColorStlCache

    },

    getBaseColoredStlBlob() {

      return this.getFaceColoredStlBlob()

    },

    getLidColoredStlBlob() {

      return this.getBodyColoredStlBlob()

    },

    getAccentColoredStlBlob() {

      return this.getFaceColoredStlBlob()

    },

    getFaceMultiStlBlob() {

      if (!faceMultiStlCache) {

        faceMultiStlCache = new Blob([partsToMultiSolidStlBuffer(faceExportParts)], { type: 'model/stl' })

      }

      return faceMultiStlCache

    },

    getBodyMultiStlBlob() {

      if (!bodyExportParts.length) return null

      if (!bodyMultiStlCache) {

        bodyMultiStlCache = new Blob([partsToMultiSolidStlBuffer(bodyExportParts)], { type: 'model/stl' })

      }

      return bodyMultiStlCache

    },

    getBaseMultiStlBlob() {

      return this.getFaceMultiStlBlob()

    },

    getLidMultiStlBlob() {

      return this.getBodyMultiStlBlob()

    },

    getAccentMultiStlBlob() {

      return this.getFaceMultiStlBlob()

    },

    getFace3mfBlob() {

      if (!face3mfCache) {

        face3mfCache = new Blob(

          [partsTo3mfBuffer(faceExportParts, `${raw.slug}_face`, { assembly: true })],

          { type: 'model/3mf' }

        )

      }

      return face3mfCache

    },

    getBody3mfBlob() {

      if (!bodyExportParts.length) return null

      if (!body3mfCache) {

        body3mfCache = new Blob(

          [partsTo3mfBuffer(bodyExportParts, `${raw.slug}_body`, { assembly: false })],

          { type: 'model/3mf' }

        )

      }

      return body3mfCache

    },

    getBase3mfBlob() {

      return this.getFace3mfBlob()

    },

    getLid3mfBlob() {

      return this.getBody3mfBlob()

    },

    getAccent3mfBlob() {

      return this.getFace3mfBlob()

    },

    getAssembly3mfBlob() {

      if (!assembly3mfCache) {

        const allParts = [...faceExportParts, ...bodyExportParts]

        assembly3mfCache = new Blob(

          [partsTo3mfBuffer(allParts, raw.slug, { assembly: true })],

          { type: 'model/3mf' }

        )

      }

      return assembly3mfCache

    },

    async getFaceGlbBlob() {

      if (!faceGlbCache) {

        faceGlbCache = new Blob([await partsToGlbBuffer(faceExportParts)], { type: 'model/gltf-binary' })

      }

      return faceGlbCache

    },

    async getBodyGlbBlob() {

      if (!bodyExportParts.length) return null

      if (!bodyGlbCache) {

        bodyGlbCache = new Blob([await partsToGlbBuffer(bodyExportParts)], { type: 'model/gltf-binary' })

      }

      return bodyGlbCache

    },

    async getBaseGlbBlob() {

      return this.getFaceGlbBlob()

    },

    async getLidGlbBlob() {

      return this.getBodyGlbBlob()

    },

    async getAccentGlbBlob() {

      return this.getFaceGlbBlob()

    },

    async getAssemblyGlbBlob() {

      if (!assemblyGlbCache) {

        const allParts = [...faceExportParts, ...bodyExportParts]

        assemblyGlbCache = new Blob([await partsToGlbBuffer(allParts)], { type: 'model/gltf-binary' })

      }

      return assemblyGlbCache

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

        prepareWorkerOpts(opts)

          .then((prepared) => {

            const handler = (event) => {

              if (event.data?.id !== id) return

              w.removeEventListener('message', handler)

              if (event.data.error) reject(new Error(event.data.error))

              else resolve(buildLiveResult(event.data.result))

            }

            w.addEventListener('message', handler)

            w.postMessage({ id, opts: prepared })

          })

          .catch(reject)

      })

  )

}



export async function generateLightbox(userOpts = {}) {

  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {

    return generateViaWorker(userOpts)

  }

  const prepared = await prepareWorkerOpts(userOpts)

  const raw = await generateLightboxCore(prepared)

  return buildLiveResult(raw)
}

