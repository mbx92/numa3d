import { eq, sql } from 'drizzle-orm'

function ints(job) {
  const good = Math.max(Math.round(Number(job.quantityGood) || 0), 0)
  const failed = Math.max(Math.round(Number(job.quantityFailed) || 0), 0)
  return { good, failed, printed: good + failed }
}

export async function applyProductionCompletion(tx, schema, job) {
  const { good, printed } = ints(job)
  if (good > 0) {
    await tx
      .update(schema.products)
      .set({ stockQuantity: sql`${schema.products.stockQuantity} + ${good}` })
      .where(eq(schema.products.id, job.productId))
  }

  const recipes = await tx
    .select()
    .from(schema.productRecipes)
    .where(eq(schema.productRecipes.productId, job.productId))
  for (const r of recipes) {
    const qty = (Number(r.quantityUsed) || 0) * printed
    if (!qty || !r.materialId) continue
    await tx
      .update(schema.materials)
      .set({ stockQuantity: sql`${schema.materials.stockQuantity} - ${qty}` })
      .where(eq(schema.materials.id, r.materialId))
  }

  const packs = await tx
    .select()
    .from(schema.productPackaging)
    .where(eq(schema.productPackaging.productId, job.productId))
  for (const p of packs) {
    const qty = (Number(p.quantityUsed) || 0) * good
    if (!qty || !p.packagingId) continue
    await tx
      .update(schema.packaging)
      .set({ stockQuantity: sql`${schema.packaging.stockQuantity} - ${qty}` })
      .where(eq(schema.packaging.id, p.packagingId))
  }
}

export async function reverseProductionCompletion(tx, schema, job) {
  const { good, printed } = ints(job)
  if (good > 0) {
    await tx
      .update(schema.products)
      .set({ stockQuantity: sql`${schema.products.stockQuantity} - ${good}` })
      .where(eq(schema.products.id, job.productId))
  }

  const recipes = await tx
    .select()
    .from(schema.productRecipes)
    .where(eq(schema.productRecipes.productId, job.productId))
  for (const r of recipes) {
    const qty = (Number(r.quantityUsed) || 0) * printed
    if (!qty || !r.materialId) continue
    await tx
      .update(schema.materials)
      .set({ stockQuantity: sql`${schema.materials.stockQuantity} + ${qty}` })
      .where(eq(schema.materials.id, r.materialId))
  }

  const packs = await tx
    .select()
    .from(schema.productPackaging)
    .where(eq(schema.productPackaging.productId, job.productId))
  for (const p of packs) {
    const qty = (Number(p.quantityUsed) || 0) * good
    if (!qty || !p.packagingId) continue
    await tx
      .update(schema.packaging)
      .set({ stockQuantity: sql`${schema.packaging.stockQuantity} + ${qty}` })
      .where(eq(schema.packaging.id, p.packagingId))
  }
}

export function parseProductionBody(body) {
  const statuses = ['queued', 'in_progress', 'done', 'cancelled']
  if (!body.date || !body.productId) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal dan produk wajib diisi' })
  }
  const status = statuses.includes(body.status) ? body.status : 'queued'
  const planned = Math.max(Math.round(Number(body.quantityPlanned) || 1), 1)
  let good = Math.max(Math.round(Number(body.quantityGood) || 0), 0)
  const failed = Math.max(Math.round(Number(body.quantityFailed) || 0), 0)
  if (status === 'done' && good <= 0) good = planned
  const machineId = body.machineId ? Number(body.machineId) : null
  return {
    date: body.date,
    productId: Number(body.productId),
    machineId: Number.isInteger(machineId) && machineId > 0 ? machineId : null,
    quantityPlanned: planned,
    quantityGood: status === 'done' ? good : good || planned,
    quantityFailed: failed,
    status,
    notes: body.notes || null,
    stockApplied: status === 'done'
  }
}
