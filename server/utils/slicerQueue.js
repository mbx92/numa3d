import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { validateStl } from './stl.js'
import { inspectCustomModel, resolveCustomMaterials } from './customModelMaterials.js'
import { normalizeSlicerRecipeConfig } from './slicerRecipe.js'

export const SLICER_TOOLS = new Set(['keychain', 'clicker', 'qr-plate', 'custom-order', 'product', '3mf-profile'])
export const MAX_SLICER_FILE_BYTES = 40 * 1024 * 1024

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })

export function validateSlicerUpload({ file, filename, tool, includeProfile }) {
  if (!SLICER_TOOLS.has(tool)) throw invalid('Generator tidak didukung untuk slicing')
  const custom = tool === 'custom-order' || tool === 'product'
  const profile3mf = tool === '3mf-profile'
  const ext = custom || profile3mf ? String(filename || '').split('.').pop().toLowerCase() : '3mf'
  if (custom && !['stl', '3mf'].includes(ext)) throw invalid('Model slicing hanya menerima file STL atau 3MF')
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

export async function enqueueSlicerJob({ db, storage, auth, file, filename, tool, includeProfile, materialIds, selectedPlate = null, selectedPlates = null, productId = null, recipeConfig = null }) {
  const input = validateSlicerUpload({ file, filename, tool, includeProfile })
  const productTarget = tool === 'product'
  const mappedMaterials = tool === 'custom-order' || productTarget || tool === '3mf-profile'
  const targetProductId = productTarget ? Number(productId) : null
  if (productTarget && (!Number.isSafeInteger(targetProductId) || targetProductId <= 0)) throw invalid('Pilih produk tujuan slicing')
  if (productTarget) {
    const [product] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, targetProductId)).limit(1)
    if (!product) throw invalid('Produk tujuan tidak ditemukan')
  }
  const normalizedRecipe = productTarget ? normalizeSlicerRecipeConfig(recipeConfig) : null
  if (normalizedRecipe?.machineId) {
    const [machine] = await db.select({ id: schema.machines.id }).from(schema.machines).where(eq(schema.machines.id, normalizedRecipe.machineId)).limit(1)
    if (!machine) throw invalid('Mesin tidak ditemukan')
  }
  if (selectedPlate != null && (!Number.isSafeInteger(selectedPlate) || selectedPlate <= 0)) throw invalid('Pilihan plate tidak valid')
  const selection = selectedPlates ?? (selectedPlate == null ? null : [selectedPlate])
  if (selection != null && (!['custom-order', 'product'].includes(tool) || input.format !== '3mf' || !Array.isArray(selection))) throw invalid('Pilihan plate hanya berlaku untuk model 3MF')
  const inspection = mappedMaterials ? inspectCustomModel(input.file, input.format, selection) : null
  if (['custom-order', 'product'].includes(tool) && input.format === '3mf' && inspection.plates.length > 1 && selection == null) throw invalid('Pilih plate 3MF sebelum slicing')
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
      productId: targetProductId,
      filename: input.filename,
      objectKey,
      tool: input.tool,
      includeProfile: input.includeProfile,
      inputConfig,
      recipeConfig: normalizedRecipe,
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
