import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'

export const SLICER_TOOLS = new Set(['keychain', 'clicker', 'qr-plate'])
export const MAX_SLICER_FILE_BYTES = 40 * 1024 * 1024

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })

export function validateSlicerUpload({ file, filename, tool, includeProfile }) {
  if (!file?.length || file.length > MAX_SLICER_FILE_BYTES) throw invalid('File 3MF wajib disertakan, maksimal 40 MB')
  if (file[0] !== 0x50 || file[1] !== 0x4b || file[2] !== 3 || file[3] !== 4) throw invalid('Format file 3MF tidak valid')
  if (!SLICER_TOOLS.has(tool)) throw invalid('Generator tidak didukung untuk slicing')
  const safeName = String(filename || 'model.3mf').replace(/[\u0000-\u001f\u007f\\/]/g, '_').slice(0, 180) || 'model.3mf'
  return { file, filename: safeName, tool, includeProfile: includeProfile !== false }
}

export async function enqueueSlicerJob({ db, storage, auth, file, filename, tool, includeProfile }) {
  const input = validateSlicerUpload({ file, filename, tool, includeProfile })
  const requestId = randomUUID()
  const objectKey = `slicer/jobs/${auth.id}/${requestId}.3mf`
  let uploaded = false
  try {
    await storage.put(objectKey, input.file)
    uploaded = true
    const [job] = await db.insert(schema.slicerJobs).values({
      userId: auth.id,
      filename: input.filename,
      objectKey,
      tool: input.tool,
      includeProfile: input.includeProfile,
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
