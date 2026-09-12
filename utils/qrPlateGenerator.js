import { Mesh, MeshStandardMaterial } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { zipSync, strToU8 } from 'fflate'
import { unpackGeometry } from './geometryPack.js'
import { partsToGlbBuffer, printGroupsTo3mfBuffer } from './keychainExport.js'
import { createQrPlateDesign, qrPlateSvg } from './qrPlateDesign.js'
import { qrPlateScad } from './qrPlateScad.js'
import { qrPlateAssemblyTransform } from './qrPlateStand.js'

let plateWorker = null
let plateJob = 0

export function disposeQrPlateWorker() {
  plateWorker?.terminate()
  plateWorker = null
  plateJob += 1
}

function getPlateWorker() {
  if (plateWorker) return plateWorker
  plateWorker = new Worker(new URL('../workers/qrPlate.worker.js', import.meta.url), { type: 'module' })
  plateWorker.addEventListener('error', () => { plateWorker = null })
  return plateWorker
}

function runQrPlateJob(payload, { signal, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Generate dibatalkan', 'AbortError'))
    const worker = getPlateWorker()
    const id = ++plateJob
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      worker.removeEventListener('message', onMessage)
      if (error) reject(error)
      else resolve(result)
    }
    const onAbort = () => finish(new DOMException('Generate dibatalkan', 'AbortError'))
    const onMessage = ({ data }) => {
      if (data?.id !== id) return
      if (data?.error) finish(new Error(data.error))
      else if (data?.result) finish(null, data.result)
      else finish(new Error('Respons worker tidak valid'))
    }
    const timer = setTimeout(() => finish(new Error('Generate melewati 60 detik. Sederhanakan desain lalu coba lagi.')), timeoutMs)
    worker.addEventListener('message', onMessage)
    signal?.addEventListener('abort', onAbort, { once: true })
    try { worker.postMessage({ id, ...payload }) } catch (error) { finish(error) }
  })
}

export function buildQrPlateResult(raw) {
  const design = raw.design
  const slug = design.opts.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'qr_plate'
  const parts = raw.parts.map((p) => ({ ...p, geometry: unpackGeometry(p.geometry) }))
  const geometry = unpackGeometry(raw.geometry)
  const assembly = parts.map((part) => {
    const next = part.geometry.clone()
    const transform = qrPlateAssemblyTransform(design)
    if (transform && part.group === 'plate') {
      next.translate(0, design.depthMm / 2, -design.opts.baseThicknessMm / 2)
      next.rotateX(transform.angle)
      next.translate(0, 0, transform.lift)
    }
    return { ...part, geometry: next }
  })
  const printParts = parts.map((part) => {
    const next = part.geometry.clone()
    if (part.group === 'stand') next.translate(design.widthMm / 2 + 8 + design.stand.widthMm / 2, 0, 0)
    return { ...part, geometry: next }
  })
  const groups = [{ name: design.opts.label, parts: parts.filter((p) => p.group === 'plate') }]
  if (design.stand) groups.push({ name: 'Alas dudukan', parts: parts.filter((p) => p.group === 'stand') })
  let disposed = false
  const cache = new Map()
  const usable = () => { if (disposed) throw new Error('Hasil sudah dibuang — Generate ulang') }
  function stl(geo) {
    const material = new MeshStandardMaterial()
    try {
      const mesh = new Mesh(geo, material)
      mesh.updateMatrixWorld(true)
      const data = new STLExporter().parse(mesh, { binary: true })
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
    } finally { material.dispose() }
  }
  return {
    slug, design, dimensions: raw.dimensions, volumeMm3: raw.volumeMm3, triangles: raw.triangles,
    warnings: raw.warnings, basePreviewParts: parts.filter((p) => p.group === 'plate'), baseExportParts: parts,
    assemblyPreviewParts: assembly, printPreviewParts: printParts,
    get3mfBlob() {
      usable()
      if (!cache.has('3mf')) cache.set('3mf', new Blob([printGroupsTo3mfBuffer(groups, slug)], { type: 'model/3mf' }))
      return cache.get('3mf')
    },
    getStlZipBlob() {
      usable()
      if (!cache.has('stl')) cache.set('stl', new Blob([zipSync({
        ...Object.fromEntries(parts.map((part) => [`${slug}_${part.role}.stl`, stl(part.geometry)])),
        'README.txt': strToU8('Impor frame, base, detail, dan icon bersama sebagai satu objek multipart. Pertahankan posisi relatif (jangan auto-drop setiap warna ke Z=0). Stand adalah objek cetak terpisah. Gunakan 3MF untuk posisi, warna, dan layout otomatis.\n')
      })], { type: 'application/zip' }))
      return cache.get('stl')
    },
    getMergedStlBlob() { usable(); return new Blob([stl(geometry)], { type: 'model/stl' }) },
    async getGlbBlob() {
      usable()
      if (!cache.has('glb')) {
        const job = partsToGlbBuffer(assembly).then((data) => new Blob([data], { type: 'model/gltf-binary' }))
        cache.set('glb', job)
        job.catch(() => { if (cache.get('glb') === job) cache.delete('glb') })
      }
      return cache.get('glb')
    },
    getScadBlob() { usable(); return new Blob([qrPlateScad(design)], { type: 'text/plain;charset=utf-8' }) },
    getSvgBlob() { usable(); return new Blob([qrPlateSvg(design)], { type: 'image/svg+xml' }) },
    dispose() {
      if (disposed) return
      disposed = true
      geometry.dispose()
      parts.forEach((p) => p.geometry.dispose())
      assembly.forEach((p) => p.geometry.dispose())
      printParts.forEach((p) => p.geometry.dispose())
      cache.clear()
    }
  }
}

export async function generateQrPlate(input, { signal } = {}) {
  const snapshot = JSON.parse(JSON.stringify(input))
  const design = createQrPlateDesign(snapshot)
  const { opts } = design
  if (signal?.aborted) throw new DOMException('Generate dibatalkan', 'AbortError')
  if (typeof Worker === 'undefined') throw new Error('Generator QR memerlukan browser dengan Web Worker')
  let fontBuffer = null
  if (design.codes.some((code) => code.caption)) {
    // Only font assets are fetched. QR content (including Wi-Fi) stays local.
    const fontUrl = new URL(opts.fontUrl, location.origin)
    if (fontUrl.origin !== location.origin || !fontUrl.pathname.startsWith('/fonts/')) throw new Error('Pilih font dari pustaka Numa3D')
    const response = await fetch(fontUrl, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Font gagal dimuat (HTTP ${response.status})`)
    fontBuffer = await response.arrayBuffer()
  }
  const raw = await runQrPlateJob({ opts: snapshot, fontBuffer }, { signal })
  return buildQrPlateResult(raw)
}
