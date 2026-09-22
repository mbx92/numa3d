import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { mayManageSlicerJob } from './slicerQueue.js'
import { ensureBucket, minioBucket, useMinio } from './minio.js'
import { fileExt } from './modelFilename.js'
import { loadFilaments } from './customModelMaterials.js'
import { stockShortages } from '#shared/utils/customOrderMaterials.js'

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400, statusMessage: message })

export function customOrderSliceValues(job, auth) {
  if (!job || !mayManageSlicerJob(auth, job)) throw invalid('Hasil slicing tidak ditemukan atau tidak dapat diakses')
  const result = job.result
  if (job.tool !== 'custom-order' || job.status !== 'completed' || !result) throw invalid('Unggah STL atau 3MF dan selesaikan slicing Orca terlebih dahulu')
  const count = result.colors?.length
  const stl = (result.inputFormat || fileExt(job.filename)) === 'stl'
  if (!count || count > (stl ? 1 : 4) || result.filamentGrams?.length !== count || (stl && (result.filamentChanges || result.primeTower))) throw invalid(stl ? 'STL hanya mendukung satu warna' : 'Statistik warna 3MF tidak valid')
  if (result.filamentGrams.some((grams) => !Number.isFinite(grams) || grams < 0)) throw invalid('Statistik filament tidak valid')
  const sum = result.filamentGrams.reduce((a, b) => a + b, 0)
  const plateCount = Math.max(1, result.selectedPlates?.length || 1)
  if (sum <= 0 || Math.abs(sum - result.totalGrams) > Math.max(0.05, plateCount * count * 0.011)) throw invalid('Statistik filament tidak cocok dengan total gram')
  if (!Number.isFinite(result.totalGrams) || result.totalGrams <= 0 || !Number.isFinite(result.printTimeSeconds) || result.printTimeSeconds <= 0) {
    throw invalid('Statistik hasil slicing tidak valid')
  }
  return {
    materialQuantityUsed: result.totalGrams,
    printTimeMinutes: Math.ceil(result.printTimeSeconds / 60),
    slicerResult: { ...result, jobId: job.id, filename: job.filename }
  }
}

export function sliceMaterialUsage(job, fallbackId) {
  const ids = job.inputConfig?.materialIds || job.result.materialIds || (job.result.filamentGrams.length === 1 ? [Number(fallbackId)] : [])
  if (ids.length !== job.result.filamentGrams.length) throw invalid('Pemetaan material hasil slicing tidak lengkap; lakukan slicing ulang')
  const sum = job.result.filamentGrams.reduce((a, b) => a + b, 0), usage = new Map()
  job.result.filamentGrams.forEach((grams, i) => {
    if (grams > 0) usage.set(ids[i], (usage.get(ids[i]) || 0) + grams / sum * job.result.totalGrams)
  })
  return [...usage].map(([materialId, quantityUsed]) => ({ materialId, quantityUsed }))
}
export async function validateCustomOrderStock(tx, usage, quantity) {
  const materials = await loadFilaments(tx, usage.map((line) => line.materialId))
  const shortages = stockShortages(usage, materials, quantity)
  if (shortages.length) throw invalid(shortages.map((s) => `${s.name}: perlu ${s.needed.toFixed(2)} g, stok ${s.stock.toFixed(2)} g`).join('; '))
}
export async function loadCustomOrderSlice(tx, jobId, materialId, auth, quantity = 1) {
  if (!Number.isSafeInteger(Number(jobId)) || Number(jobId) <= 0) throw invalid('Unggah STL atau 3MF dan selesaikan slicing Orca terlebih dahulu')
  const [job] = await tx.select().from(schema.slicerJobs).where(eq(schema.slicerJobs.id, Number(jobId)))
  const values = customOrderSliceValues(job, auth)
  const materialUsage = sliceMaterialUsage(job, materialId)
  await validateCustomOrderStock(tx, materialUsage, quantity)
  values.materialId = materialUsage[0].materialId
  return { job, values, materialUsage }
}
export async function validateCustomOrderFilament(tx, materialId) { await loadFilaments(tx, [Number(materialId)]) }
export async function loadCustomOrderMaterials(tx, orderId) {
  return tx.select({ materialId: schema.customOrderMaterials.materialId, quantityUsed: schema.customOrderMaterials.quantityUsed, material: schema.materials })
    .from(schema.customOrderMaterials).leftJoin(schema.materials, eq(schema.customOrderMaterials.materialId, schema.materials.id))
    .where(eq(schema.customOrderMaterials.customOrderId, orderId))
}
export async function saveCustomOrderMaterials(tx, orderId, usage) {
  await tx.delete(schema.customOrderMaterials).where(eq(schema.customOrderMaterials.customOrderId, orderId))
  await tx.insert(schema.customOrderMaterials).values(usage.map((line) => ({ ...line, customOrderId: orderId })))
}

// Copy out of the temporary queue so deleting a slicer job keeps the original model.
export async function copyCustomOrderModel(tx, orderId, job, onCopied) {
  const ext = fileExt(job.filename)
  if (!['stl', '3mf'].includes(ext)) throw invalid('Format file pesanan custom tidak valid')
  const objectKey = `custom-orders/${orderId}/${randomUUID()}.${ext}`
  await ensureBucket()
  const client = useMinio(), bucket = minioBucket()
  onCopied(objectKey)
  await client.copyObject(bucket, objectKey, `/${bucket}/${job.objectKey}`)
  const stat = await client.statObject(bucket, objectKey)
  await tx.insert(schema.customOrderFiles).values({
    customOrderId: orderId, objectKey, filename: job.filename, sizeBytes: stat.size, contentType: `model/${ext}`
  })
}

export async function cleanupCustomOrderModel(objectKey) {
  if (objectKey) await useMinio().removeObject(minioBucket(), objectKey).catch(() => {})
}
