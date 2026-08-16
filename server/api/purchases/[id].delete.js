import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.supplierPurchases).where(eq(schema.supplierPurchases.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Pembelian tidak ditemukan' })
  const purchase = rows[0]
  const lines = await db.select().from(schema.supplierPurchaseLines).where(eq(schema.supplierPurchaseLines.purchaseId, id))

  await db.transaction(async (tx) => {
    for (const line of lines) {
      if (line.itemType === 'material' && line.materialId) {
        await tx
          .update(schema.materials)
          .set({ stockQuantity: sql`GREATEST(${schema.materials.stockQuantity} - ${line.quantity}, 0)` })
          .where(eq(schema.materials.id, line.materialId))
      } else if (line.itemType === 'packaging' && line.packagingId) {
        await tx
          .update(schema.packaging)
          .set({ stockQuantity: sql`GREATEST(${schema.packaging.stockQuantity} - ${line.quantity}, 0)` })
          .where(eq(schema.packaging.id, line.packagingId))
      }
    }
    if (purchase.expenseId) {
      await tx.delete(schema.expenses).where(eq(schema.expenses.id, purchase.expenseId))
    }
    await tx.delete(schema.supplierPurchases).where(eq(schema.supplierPurchases.id, id))
  })

  await logAudit(event, {
    action: 'delete',
    entity: 'supplier_purchase',
    entityId: id,
    summary: `Hapus pembelian ke "${purchase.supplier}" (stok dikembalikan, pengeluaran dihapus)`
  })
  return { ok: true }
})
