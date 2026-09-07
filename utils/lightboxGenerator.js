// API generate lightbox — offload ke Web Worker agar UI tidak freeze.

import { generateLightboxCore } from './lightboxCore.js'
import { unpackGeometry } from './geometryPack.js'

import { parseSvgToShapeLayers, serializeShapeLayers } from './svgToShapes.js'

import { imageToLayers } from './imageToLayers.js'

import { serializeDesignLayers } from './lightboxFootprint.js'

import { LIGHTBOX_DEFAULTS } from './lightboxPresets.js'

import {

  EXPORT_FORMATS,

  exportFilename,

  exportMime,

  printGroupsTo3mfBuffer,

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

  return {
    geometry,
    color: p.color,
    line: !!p.line,
    role: p.role || null,
    name: p.name || p.role || null,
    previewOnly: !!p.previewOnly,
    opacity: p.opacity ?? null,
    glow: !!p.glow,
    glowIntensity: p.glowIntensity ?? null
  }

}



function exportParts(parts) {

  return parts.filter((p) => !p.previewOnly && !p.line && p.geometry?.attributes?.position?.count)

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



  if (mode === 'svg' || mode === 'svg-qr') {

    const svgContent = String(cloned.svgContent || '').trim()

    if (svgContent) {

      const layers = parseSvgToShapeLayers(svgContent)

      if (!layers.length) throw new Error('SVG tidak punya area fill solid')

      cloned.svgLayers = serializeShapeLayers(layers)

      delete cloned.svgContent

    }

  }



  return cloned

}



function buildLiveResult(raw) {

  const geos = []

  const facePreviewParts = (raw.frontSidePreviewParts || raw.facePreviewParts || raw.basePreviewParts || []).map((p) =>

    mapPreviewPart(p, geos)

  )

  const bodyPreviewParts = (raw.backPreviewParts || raw.bodyPreviewParts || raw.lidPreviewParts || []).map((p) =>

    mapPreviewPart(p, geos)

  )

  const standPreviewParts = (raw.standPreviewParts || []).map((p) => mapPreviewPart(p, geos))

  const standExportPreviewParts = (raw.standExportPreviewParts || raw.standPreviewParts || []).map((p) => mapPreviewPart(p, geos))

  const assemblyPreviewParts = (raw.assemblyPreviewParts || []).map((p) => mapPreviewPart(p, geos))



  const faceExportParts = exportParts(facePreviewParts)

  const bodyExportParts = exportParts(bodyPreviewParts)

  const standExportParts = exportParts(standExportPreviewParts)

  const assemblyExportParts = exportParts(assemblyPreviewParts)



  let faceBlobCache = null

  let bodyBlobCache = null

  let standBlobCache = null

  let faceColorStlCache = null

  let bodyColorStlCache = null

  let standColorStlCache = null

  let faceMultiStlCache = null

  let bodyMultiStlCache = null

  let standMultiStlCache = null

  let face3mfCache = null

  let body3mfCache = null

  let stand3mfCache = null

  let faceGlbCache = null

  let bodyGlbCache = null

  let standGlbCache = null

  let assembly3mfCache = null

  let assemblyGlbCache = null



  const frontSideStlBuffer = raw.frontSideStlBuffer || raw.baseStlBuffer

  const bodyStlBuffer = raw.backStlBuffer || raw.bodyStlBuffer || raw.lidStlBuffer



  return {

    slug: raw.slug,
    getPlate3mfBlob() {
      return new Blob([printGroupsTo3mfBuffer([{ name: 'Front & Side', parts: faceExportParts }, { name: 'Back', parts: bodyExportParts }, { name: 'Stand', parts: standExportParts }], raw.slug)], { type: 'model/3mf' })
    },

    designMode: raw.designMode,

    frontSideFilename: raw.frontSideFilename || raw.baseFilename,

    backFilename: raw.backFilename || raw.bodyFilename,

    baseFilename: raw.frontSideFilename || raw.baseFilename,

    bodyFilename: raw.backFilename || raw.bodyFilename,

    standFilename: raw.standFilename,

    lidFilename: raw.backFilename || raw.bodyFilename,

    accentFilename: raw.frontSideFilename || raw.baseFilename,

    basePreviewColor: raw.basePreviewColor,

    facePreviewParts,

    bodyPreviewParts,

    frontSidePreviewParts: facePreviewParts,

    backPreviewParts: bodyPreviewParts,

    standPreviewParts,

    basePreviewParts: facePreviewParts,

    lidPreviewParts: bodyPreviewParts,

    accentPreviewParts: facePreviewParts,

    assemblyPreviewParts,

    faceExportParts,

    bodyExportParts,

    frontSideExportParts: faceExportParts,

    backExportParts: bodyExportParts,

    standExportParts,

    assemblyExportParts,

    baseExportParts: faceExportParts,

    lidExportParts: bodyExportParts,

    accentExportParts: faceExportParts,

    dimensions: raw.dimensions,

    layerPalette: raw.layerPalette || [],

    getFaceBlob() {

      if (!frontSideStlBuffer) return null

      if (!faceBlobCache) faceBlobCache = new Blob([frontSideStlBuffer], { type: 'model/stl' })

      return faceBlobCache

    },

    getFrontSideBlob() {

      return this.getFaceBlob()

    },

    getBodyBlob() {

      if (!bodyStlBuffer) return null

      if (!bodyBlobCache) bodyBlobCache = new Blob([bodyStlBuffer], { type: 'model/stl' })

      return bodyBlobCache

    },

    getBackBlob() {

      return this.getBodyBlob()

    },

    getStandBlob() {

      if (!raw.standStlBuffer) return null

      if (!standBlobCache) standBlobCache = new Blob([raw.standStlBuffer], { type: 'model/stl' })

      return standBlobCache

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

    getFrontSideColoredStlBlob() {

      return this.getFaceColoredStlBlob()

    },

    getBodyColoredStlBlob() {

      if (!bodyExportParts.length) return null

      if (!bodyColorStlCache) {

        bodyColorStlCache = new Blob([partsToColoredStlBuffer(bodyExportParts)], { type: 'model/stl' })

      }

      return bodyColorStlCache

    },

    getBackColoredStlBlob() {

      return this.getBodyColoredStlBlob()

    },

    getStandColoredStlBlob() {

      if (!standExportParts.length) return null

      if (!standColorStlCache) {

        standColorStlCache = new Blob([partsToColoredStlBuffer(standExportParts)], { type: 'model/stl' })

      }

      return standColorStlCache

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

    getFrontSideMultiStlBlob() {

      return this.getFaceMultiStlBlob()

    },

    getBodyMultiStlBlob() {

      if (!bodyExportParts.length) return null

      if (!bodyMultiStlCache) {

        bodyMultiStlCache = new Blob([partsToMultiSolidStlBuffer(bodyExportParts)], { type: 'model/stl' })

      }

      return bodyMultiStlCache

    },

    getBackMultiStlBlob() {

      return this.getBodyMultiStlBlob()

    },

    getStandMultiStlBlob() {

      if (!standExportParts.length) return null

      if (!standMultiStlCache) {

        standMultiStlCache = new Blob([partsToMultiSolidStlBuffer(standExportParts)], { type: 'model/stl' })

      }

      return standMultiStlCache

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

          [printGroupsTo3mfBuffer([{ name: 'Front & Side', parts: faceExportParts }], `${raw.slug}_front_side`)],

          { type: 'model/3mf' }

        )

      }

      return face3mfCache

    },

    getFrontSide3mfBlob() {

      return this.getFace3mfBlob()

    },

    getBody3mfBlob() {

      if (!bodyExportParts.length) return null

      if (!body3mfCache) {

        body3mfCache = new Blob(

          [printGroupsTo3mfBuffer([{ name: 'Back', parts: bodyExportParts }], `${raw.slug}_back`)],

          { type: 'model/3mf' }

        )

      }

      return body3mfCache

    },

    getBack3mfBlob() {

      return this.getBody3mfBlob()

    },

    getStand3mfBlob() {

      if (!standExportParts.length) return null

      if (!stand3mfCache) {

        stand3mfCache = new Blob(

          [printGroupsTo3mfBuffer([{ name: 'Stand', parts: standExportParts }], `${raw.slug}_stand_${raw.dimensions?.standModelId || 'model'}`)],

          { type: 'model/3mf' }

        )

      }

      return stand3mfCache

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

        assembly3mfCache = new Blob(

          [printGroupsTo3mfBuffer([{ name: 'Front & Side', parts: faceExportParts }, { name: 'Back', parts: bodyExportParts }, { name: 'Stand', parts: standExportParts }], raw.slug)],

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

    async getFrontSideGlbBlob() {

      return this.getFaceGlbBlob()

    },

    async getBodyGlbBlob() {

      if (!bodyExportParts.length) return null

      if (!bodyGlbCache) {

        bodyGlbCache = new Blob([await partsToGlbBuffer(bodyExportParts)], { type: 'model/gltf-binary' })

      }

      return bodyGlbCache

    },

    async getBackGlbBlob() {

      return this.getBodyGlbBlob()

    },

    async getStandGlbBlob() {

      if (!standExportParts.length) return null

      if (!standGlbCache) {

        standGlbCache = new Blob([await partsToGlbBuffer(standExportParts)], { type: 'model/gltf-binary' })

      }

      return standGlbCache

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

        assemblyGlbCache = new Blob([await partsToGlbBuffer(assemblyExportParts)], { type: 'model/gltf-binary' })

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
