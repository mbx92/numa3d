import { eq, inArray } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { computeHpp } from './hpp.js'
import { getSettings } from './settings.js'

// Hitung HPP untuk banyak produk sekaligus. Mengembalikan Map productId -> hasil computeHpp.
export async function getHppForProducts(productIds) {
  const map = new Map()
  if (!productIds.length) return map
  const db = useDb()
  const settings = await getSettings()

  const recipeRows = await db
    .select({
      id: schema.productRecipes.id,
      productId: schema.productRecipes.productId,
      materialId: schema.productRecipes.materialId,
      quantityUsed: schema.productRecipes.quantityUsed,
      printTimeMinutes: schema.productRecipes.printTimeMinutes,
      machineId: schema.productRecipes.machineId,
      failureRatePercent: schema.productRecipes.failureRatePercent,
      laborMinutes: schema.productRecipes.laborMinutes,
      laborRatePerHour: schema.productRecipes.laborRatePerHour,
      material: schema.materials,
      machine: schema.machines
    })
    .from(schema.productRecipes)
    .leftJoin(schema.materials, eq(schema.productRecipes.materialId, schema.materials.id))
    .leftJoin(schema.machines, eq(schema.productRecipes.machineId, schema.machines.id))
    .where(inArray(schema.productRecipes.productId, productIds))

  const packRows = await db
    .select({
      id: schema.productPackaging.id,
      productId: schema.productPackaging.productId,
      packagingId: schema.productPackaging.packagingId,
      quantityUsed: schema.productPackaging.quantityUsed,
      packaging: schema.packaging
    })
    .from(schema.productPackaging)
    .leftJoin(schema.packaging, eq(schema.productPackaging.packagingId, schema.packaging.id))
    .where(inArray(schema.productPackaging.productId, productIds))

  for (const pid of productIds) {
    const recipes = recipeRows.filter((r) => r.productId === pid)
    const packs = packRows.filter((p) => p.productId === pid)
    map.set(pid, {
      ...computeHpp(recipes, packs, settings),
      recipeRows: recipes,
      packagingRows: packs
    })
  }
  return map
}

export async function getHppForProduct(productId) {
  const map = await getHppForProducts([productId])
  return map.get(productId)
}
