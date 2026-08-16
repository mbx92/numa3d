import { eq, inArray } from 'drizzle-orm'

// Cari product_id yang memakai material/packaging pada baris pembelian,
// lewat recipe dan product_packaging.
export async function productIdsForPurchaseLines(tx, schema, lines) {
  const materialIds = [...new Set(lines.filter((l) => l.itemType === 'material' && l.materialId).map((l) => l.materialId))]
  const packagingIds = [...new Set(lines.filter((l) => l.itemType === 'packaging' && l.packagingId).map((l) => l.packagingId))]
  const ids = new Set()

  if (materialIds.length) {
    const rows = await tx
      .select({ productId: schema.productRecipes.productId })
      .from(schema.productRecipes)
      .where(inArray(schema.productRecipes.materialId, materialIds))
    for (const r of rows) ids.add(r.productId)
  }
  if (packagingIds.length) {
    const rows = await tx
      .select({ productId: schema.productPackaging.productId })
      .from(schema.productPackaging)
      .where(inArray(schema.productPackaging.packagingId, packagingIds))
    for (const r of rows) ids.add(r.productId)
  }
  return [...ids]
}

export async function setExpenseProducts(tx, schema, expenseId, productIds) {
  await tx.delete(schema.expenseProducts).where(eq(schema.expenseProducts.expenseId, expenseId))
  const unique = [...new Set((productIds || []).map(Number).filter((n) => n > 0))]
  if (!unique.length) return
  await tx.insert(schema.expenseProducts).values(unique.map((productId) => ({ expenseId, productId })))
}
