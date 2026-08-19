import { eq, inArray } from 'drizzle-orm'

export function purchaseItemLabel(name, quantity, unit) {
  const qty = Number(quantity)
  const qtyStr = Number.isInteger(qty) ? String(qty) : String(qty)
  return [name, qtyStr, unit].filter(Boolean).join(' ')
}

// Label baris pembelian (material/packaging + qty) per expense_id.
export async function purchaseItemLabelsByExpenseIds(tx, schema, expenseIds) {
  const map = new Map()
  const ids = [...new Set((expenseIds || []).filter(Boolean))]
  if (!ids.length) return map

  const purchases = await tx
    .select({
      id: schema.supplierPurchases.id,
      expenseId: schema.supplierPurchases.expenseId
    })
    .from(schema.supplierPurchases)
    .where(inArray(schema.supplierPurchases.expenseId, ids))
  if (!purchases.length) return map

  const purchaseIds = purchases.map((p) => p.id)
  const expenseByPurchase = new Map(purchases.map((p) => [p.id, p.expenseId]))

  const lines = await tx
    .select({
      purchaseId: schema.supplierPurchaseLines.purchaseId,
      quantity: schema.supplierPurchaseLines.quantity,
      itemType: schema.supplierPurchaseLines.itemType,
      materialName: schema.materials.name,
      materialUnit: schema.materials.unit,
      packagingName: schema.packaging.name,
      packagingUnit: schema.packaging.unit
    })
    .from(schema.supplierPurchaseLines)
    .leftJoin(schema.materials, eq(schema.supplierPurchaseLines.materialId, schema.materials.id))
    .leftJoin(schema.packaging, eq(schema.supplierPurchaseLines.packagingId, schema.packaging.id))
    .where(inArray(schema.supplierPurchaseLines.purchaseId, purchaseIds))

  for (const line of lines) {
    const expenseId = expenseByPurchase.get(line.purchaseId)
    if (!expenseId) continue
    const name = line.itemType === 'packaging' ? line.packagingName : line.materialName
    const unit = line.itemType === 'packaging' ? line.packagingUnit : line.materialUnit
    const label = purchaseItemLabel(name || '(barang dihapus)', line.quantity, unit || '')
    const arr = map.get(expenseId) || []
    arr.push(label)
    map.set(expenseId, arr)
  }
  return map
}

export async function setExpenseProducts(tx, schema, expenseId, productIds) {
  await tx.delete(schema.expenseProducts).where(eq(schema.expenseProducts.expenseId, expenseId))
  const unique = [...new Set((productIds || []).map(Number).filter((n) => n > 0))]
  if (!unique.length) return
  await tx.insert(schema.expenseProducts).values(unique.map((productId) => ({ expenseId, productId })))
}
