import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { validateStl } from './stl.js'
import { inspectCustomModel, resolveCustomMaterials } from './customModelMaterials.js'

export const SLICER_TOOLS = new Set(['keychain', 'clicker', 'qr-plate', 'custom-order', '3mf-profile'])
export const MAX_SLICER_FILE_BYTES = 40 * 1024 * 1024

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })

export function validateSlicerUpload({ file, filename, tool, includeProfile }) {
  if (!SLICER_TOOLS.has(tool)) throw invalid('Generator tidak didukung untuk slicing')
  const custom = tool === 'custom-order'
  const profile3mf = tool === '3mf-profile'
  const ext = custom || profile3mf ? String(filename || '').split('.').pop().toLowerCase() : '3mf'
  if (custom && !['stl', '3mf'].includes(ext)) throw invalid('Custom order hanya menerima file STL atau 3MF untuk slicing')
  if (profile3mf && ext !== '3mf') throw invalid('Tool profil Anycubic hanya menerima file 3MF')
  if (!file?.length || file.length > MAX_SLICER_FILE_BYTES) throw invalid(`File ${ext.toUpperCase()} wajib disertakan, maksimal 40 MB`)
  if (custom && ext === 'stl') {
    validateStl(file)
  } else if (file[0] !== 0x50 || file[1] !== 0x4b || file[2] !== 3 || file[3] !== 4) throw invalid('Format file 3MF tidak valid')
  const cleaned = String(filename || `model.${ext}`).replace(/[\u0000-\u001f\u007f\\/]/g, '_')
  const uploadedModel = custom || profile3mf
  const safeName = uploadedModel ? `${cleaned.slice(0, -(ext.length + 1)).slice(0, 179 - ext.length)}.${ext}` : cleaned.slice(0, 180)
  return { file, filename: safeName, tool, format: ext, includeProfile: profile3mf ? true : custom ? false : includeProfile !== false }
}

export async function enqueueSlicerJob({ db, storage, auth, file, filename, tool, includeProfile, materialIds, selectedPlate = null, selectedPlates = null }) {
  const input = validateSlicerUpload({ file, filename, tool, includeProfile })
  const mappedMaterials = tool === 'custom-order' || tool === '3mf-profile'
  if (selectedPlate != null && (!Number.isSafeInteger(selectedPlate) || selectedPlate <= 0)) throw invalid('Pilihan plate tidak valid')
  const selection = selectedPlates ?? (selectedPlate == null ? null : [selectedPlate])
  if (selection != null && (tool !== 'custom-order' || input.format !== '3mf' || !Array.isArray(selection))) throw invalid('Pilihan plate hanya berlaku untuk 3MF Custom Order')
  const inspection = mappedMaterials ? inspectCustomModel(input.file, input.format, selection) : null
  if (tool === 'custom-order' && input.format === '3mf' && inspection.plates.length > 1 && selection == null) throw invalid('Pilih plate 3MF sebelum slicing')
  if (tool === '3mf-profile' && inspection.plates.length > 1) throw invalid('Tool profil hanya mendukung satu plate 3MF')
  if (inspection?.empty || inspection?.emptyPlates?.length) throw invalid('Plate 3MF yang dipilih tidak memiliki model yang dapat dicetak')
  const inputConfig = mappedMaterials ? await resolveCustomMaterials(db, inspection, materialIds) : null
  const requestId = randomUUID()
  const objectKey = `slicer/jobs/${auth.id}/${requestId}.${input.format}`
  let uploaded = false
  try {
    await storage.put(objectKey, input.file, `model/${input.format}`)
    uploaded = true
    const [job] = await db.insert(schema.slicerJobs).values({
      userId: auth.id,
      filename: input.filename,
      objectKey,
      tool: input.tool,
      includeProfile: input.includeProfile,
      inputConfig,
      stage: 'Menunggu worker'
    }).returning()
    return job
  } catch (error) {
    if (uploaded) await storage.remove(objectKey).catch(() => {})
    throw error
  }
}

export function mayManageSlicerJob(auth, job) {
  return auth?.role === 'admin' || Number(auth?.id) === Number(job?.userId)
}

export function publicSlicerJob(job) {
  if (!job) return job
  const { objectKey, ...safe } = job
  return safe
}

export async function findSlicerJob(db, id) {
  const [job] = await db.select().from(schema.slicerJobs).where(eq(schema.slicerJobs.id, Number(id))).limit(1)
  return job || null
}

export async function requestSlicerCancel(db, id) {
  const jobId = Number(id)
  const [cancelled] = await db.update(schema.slicerJobs).set({
    status: 'cancelled', cancelRequested: true, stage: 'Dibatalkan', progress: 0, finishedAt: new Date()
  }).where(and(eq(schema.slicerJobs.id, jobId), eq(schema.slicerJobs.status, 'queued'))).returning()
  if (cancelled) return cancelled
  const [processing] = await db.update(schema.slicerJobs).set({
    cancelRequested: true, stage: 'Membatalkan proses'
  }).where(and(eq(schema.slicerJobs.id, jobId), eq(schema.slicerJobs.status, 'processing'))).returning()
  return processing || null
}

export async function retrySlicerJob(db, id) {
  const jobId = Number(id)
  const [job] = await db.update(schema.slicerJobs).set({
    status: 'queued', workerId: null, progress: 0, stage: 'Menunggu worker', result: null,
    error: null, cancelRequested: false, startedAt: null, finishedAt: null, heartbeatAt: null
  }).where(and(eq(schema.slicerJobs.id, jobId), eq(schema.slicerJobs.status, 'cancelled'))).returning()
  if (job) return job
  const current = await findSlicerJob(db, jobId)
  if (!current || current.status !== 'failed') return null
  const [failed] = await db.update(schema.slicerJobs).set({
    status: 'queued', workerId: null, progress: 0, stage: 'Menunggu worker', result: null,
    error: null, cancelRequested: false, startedAt: null, finishedAt: null, heartbeatAt: null
  }).where(and(eq(schema.slicerJobs.id, jobId), eq(schema.slicerJobs.status, 'failed'))).returning()
  return failed || null
}
