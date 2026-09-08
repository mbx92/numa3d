import { Mesh, MeshStandardMaterial } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { unpackGeometry } from './geometryPack.js'
import { partsToGlbBuffer, printGroupsTo3mfBuffer } from './keychainExport.js'
import { runCodeStudioJob } from './codeStudioJob.js'

export function buildCodeStudioResult(raw, { label = 'Code Studio', color = '#f97316' } = {}) {
  label = String(label).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 64) || 'Code Studio'
  const slug = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'code_studio'
  const geometry = unpackGeometry(raw.geometry)
  const parts = [{ geometry, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#f97316', role: 'base', name: 'Model' }]
  const cache = new Map()
  let disposed = false
  const usable = () => { if (disposed) throw new Error('Model sudah dibuang; Generate ulang') }
  return {
    slug, dimensions: raw.dimensions, volumeMm3: raw.volumeMm3,
    triangles: raw.triangles, parameters: raw.parameters, nodeCount: raw.nodeCount,
    baseFilename: `${slug}.stl`, basePreviewParts: parts, baseExportParts: parts,
    getBaseBlob() {
      usable()
      if (!cache.has('stl')) {
        const material = new MeshStandardMaterial()
        try {
          const mesh = new Mesh(geometry, material)
          mesh.updateMatrixWorld(true)
          const data = new STLExporter().parse(mesh, { binary: true })
          cache.set('stl', new Blob([data], { type: 'model/stl' }))
        } finally { material.dispose() }
      }
      return cache.get('stl')
    },
    getBase3mfBlob() {
      usable()
      if (!cache.has('3mf')) cache.set('3mf', new Blob([
        printGroupsTo3mfBuffer([{ name: label, parts }], slug)
      ], { type: 'model/3mf' }))
      return cache.get('3mf')
    },
    getPlate3mfBlob() { return this.getBase3mfBlob() },
    async getBaseGlbBlob() {
      usable()
      if (!cache.has('glb')) {
        const job = partsToGlbBuffer(parts).then((buffer) => new Blob([buffer], { type: 'model/gltf-binary' }))
        cache.set('glb', job)
        job.catch(() => { if (cache.get('glb') === job) cache.delete('glb') })
      }
      return cache.get('glb')
    },
    dispose() {
      if (!disposed) geometry.dispose()
      disposed = true
      cache.clear()
    }
  }
}

export async function generateCodeStudio(opts, { signal } = {}) {
  if (typeof Worker === 'undefined') throw new Error('Code Studio memerlukan browser dengan Web Worker')
  const raw = await runCodeStudioJob(
    () => new Worker(new URL('../workers/codeStudio.worker.js', import.meta.url), { type: 'module' }),
    { source: opts.source, values: { ...opts.values } }, { signal }
  )
  return buildCodeStudioResult(raw, opts)
}
