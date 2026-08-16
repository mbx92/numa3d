import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { productIdsForPurchaseLines, setExpenseProducts } from '../../utils/expenseProducts.js'
import { assertExpenseCategory } from '../../utils/expenseCategory.js'

function lineAmount(qty, unitPrice) {
  return Math.round((Number(qty) || 0) * (Number(unitPrice) || 0))
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.date || !body.supplier) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal dan supplier wajib diisi' })
  }
  const rawLines = Array.isArray(body.lines) ? body.lines : []
  const lines = rawLines
    .map((l) => ({
      itemType: l.itemType === 'packaging' ? 'packaging' : 'material',
      materialId: l.itemType === 'packaging' ? null : Number(l.materialId) || null,
      packagingId: l.itemType === 'packaging' ? Number(l.packagingId) || null : null,
      quantity: Number(l.quantity) || 0,
      unitPrice: Math.round(Number(l.unitPrice) || 0)
    }))
    .filter((l) => l.quantity > 0 && ((l.itemType === 'material' && l.materialId) || (l.itemType === 'packaging' && l.packagingId)))

  if (!lines.length) throw createError({ statusCode: 400, statusMessage: 'Minimal satu baris barang dengan qty > 0' })

  const db = useDb()
  const result = await db.transaction(async (tx) => {
    const totalAmount = lines.reduce((a, l) => a + lineAmount(l.quantity, l.unitPrice), 0)
    const [purchase] = await tx
      .insert(schema.supplierPurchases)
      .values({
        date: body.date,
        supplier: String(body.supplier).trim(),
        notes: body.notes || null,
        totalAmount
      })
      .returning()

    const names = []
    for (const line of lines) {
      const amount = lineAmount(line.quantity, line.unitPrice)
      await tx.insert(schema.supplierPurchaseLines).values({
        purchaseId: purchase.id,
        itemType: line.itemType,
        materialId: line.materialId,
        packagingId: line.packagingId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount
      })

      if (line.itemType === 'material') {
        const [row] = await tx
          .update(schema.materials)
          .set({
            stockQuantity: sql`${schema.materials.stockQuantity} + ${line.quantity}`,
            pricePerUnit: line.unitPrice
          })
          .where(eq(schema.materials.id, line.materialId))
          .returning({ name: schema.materials.name, unit: schema.materials.unit })
        if (!row) throw createError({ statusCode: 400, statusMessage: 'Material tidak ditemukan' })
        names.push(`${row.name} ${line.quantity} ${row.unit}`)
      } else {
        const [row] = await tx
          .update(schema.packaging)
          .set({
            stockQuantity: sql`${schema.packaging.stockQuantity} + ${line.quantity}`,
            pricePerUnit: line.unitPrice
          })
          .where(eq(schema.packaging.id, line.packagingId))
          .returning({ name: schema.packaging.name, unit: schema.packaging.unit })
        if (!row) throw createError({ statusCode: 400, statusMessage: 'Packaging tidak ditemukan' })
        names.push(`${row.name} ${line.quantity} ${row.unit}`)
      }
    }

    const hasMaterial = lines.some((l) => l.itemType === 'material')
    const hasPackaging = lines.some((l) => l.itemType === 'packaging')
    const requested = String(body.category || '').trim()
    const fallback = hasMaterial ? 'material' : hasPackaging ? 'packaging' : 'other'
    const cat = await assertExpenseCategory(tx, schema, requested || fallback)
    const relatedProductIds = await productIdsForPurchaseLines(tx, schema, lines)
    const [expense] = await tx
      .insert(schema.expenses)
      .values({
        date: body.date,
        category: cat.key,
        description: `Pembelian ke ${purchase.supplier}: ${names.join(', ')}`,
        amount: totalAmount,
        relatedProductId: relatedProductIds[0] || null
      })
      .returning()
    await setExpenseProducts(tx, schema, expense.id, relatedProductIds)

    const [updated] = await tx
      .update(schema.supplierPurchases)
      .set({ expenseId: expense.id })
      .where(eq(schema.supplierPurchases.id, purchase.id))
      .returning()

    return { purchase: updated, expense }
  })

  await logAudit(event, {
    action: 'create',
    entity: 'supplier_purchase',
    entityId: result.purchase.id,
    summary: `Pembelian ke "${result.purchase.supplier}" Rp ${result.purchase.totalAmount.toLocaleString('id-ID')} (stok + pengeluaran otomatis)`
  })
  return result.purchase
})
