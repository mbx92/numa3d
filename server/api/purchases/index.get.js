import { eq, desc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { sanitizeText } from '../../../utils/sanitizeText.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const purchases = await db
    .select()
    .from(schema.supplierPurchases)
    .orderBy(desc(schema.supplierPurchases.date), desc(schema.supplierPurchases.id))

  if (!purchases.length) return []

  const lines = await db.select().from(schema.supplierPurchaseLines)
  const materials = await db.select({ id: schema.materials.id, name: schema.materials.name, unit: schema.materials.unit }).from(schema.materials)
  const packaging = await db.select({ id: schema.packaging.id, name: schema.packaging.name, unit: schema.packaging.unit }).from(schema.packaging)
  const matMap = new Map(materials.map((m) => [m.id, m]))
  const packMap = new Map(packaging.map((p) => [p.id, p]))

  const linesByPurchase = new Map()
  for (const line of lines) {
    const item =
      line.itemType === 'material' ? matMap.get(line.materialId) : packMap.get(line.packagingId)
    const row = {
      ...line,
      itemName: sanitizeText(item?.name) || '(barang dihapus)',
      unit: sanitizeText(item?.unit) || ''
    }
    const arr = linesByPurchase.get(line.purchaseId) || []
    arr.push(row)
    linesByPurchase.set(line.purchaseId, arr)
  }

  return purchases.map((p) => ({
    ...p,
    supplier: sanitizeText(p.supplier) || p.supplier,
    notes: p.notes ? sanitizeText(p.notes) : p.notes,
    lines: linesByPurchase.get(p.id) || []
  }))
})
