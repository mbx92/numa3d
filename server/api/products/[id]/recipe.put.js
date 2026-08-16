import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'

// Ganti seluruh recipe + packaging produk sekaligus (dipakai Recipe Builder).
// body: { recipes: [{materialId, quantityUsed, printTimeMinutes, machineId,
//         failureRatePercent, laborMinutes, laborRatePerHour}], packaging: [{packagingId, quantityUsed}] }
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const db = useDb()

  await db.transaction(async (tx) => {
    await tx.delete(schema.productRecipes).where(eq(schema.productRecipes.productId, id))
    await tx.delete(schema.productPackaging).where(eq(schema.productPackaging.productId, id))

    const recipes = (body.recipes || []).filter((r) => r.materialId)
    if (recipes.length) {
      await tx.insert(schema.productRecipes).values(
        recipes.map((r) => ({
          productId: id,
          materialId: Number(r.materialId),
          quantityUsed: Number(r.quantityUsed) || 0,
          printTimeMinutes: Math.round(Number(r.printTimeMinutes) || 0),
          machineId: r.machineId ? Number(r.machineId) : null,
          failureRatePercent: Number(r.failureRatePercent) || 0,
          laborMinutes: Math.round(Number(r.laborMinutes) || 0),
          laborRatePerHour: Math.round(Number(r.laborRatePerHour) || 0)
        }))
      )
    }

    const packs = (body.packaging || []).filter((p) => p.packagingId)
    if (packs.length) {
      await tx.insert(schema.productPackaging).values(
        packs.map((p) => ({
          productId: id,
          packagingId: Number(p.packagingId),
          quantityUsed: Number(p.quantityUsed) || 1
        }))
      )
    }
  })

  await logAudit(event, { action: 'update', entity: 'product_recipe', entityId: id, summary: `Ubah recipe & HPP produk id ${id}` })
  return { ok: true }
})
