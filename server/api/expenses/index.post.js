import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { setExpenseProducts } from '../../utils/expenseProducts.js'
import { assertExpenseCategory } from '../../utils/expenseCategory.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.date || !body.description) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal dan deskripsi wajib diisi' })
  }
  const db = useDb()
  const relatedProductId = body.relatedProductId ? Number(body.relatedProductId) : null
  const cat = await assertExpenseCategory(db, schema, body.category)
  const rows = await db
    .insert(schema.expenses)
    .values({
      date: body.date,
      category: cat.key,
      description: body.description,
      amount: Math.round(Number(body.amount) || 0),
      relatedProductId
    })
    .returning()
  await setExpenseProducts(db, schema, rows[0].id, relatedProductId ? [relatedProductId] : [])
  await logAudit(event, {
    action: 'create',
    entity: 'expense',
    entityId: rows[0].id,
    summary: `Catat pengeluaran "${rows[0].description}" (Rp ${rows[0].amount.toLocaleString('id-ID')})`
  })
  return rows[0]
})
