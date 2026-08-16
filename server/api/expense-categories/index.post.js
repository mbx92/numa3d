import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { uniqueCategoryKey } from '../../utils/expenseCategory.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = String(body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Nama kategori wajib diisi' })
  const db = useDb()
  const key = await uniqueCategoryKey(db, schema, name)
  const rows = await db
    .insert(schema.expenseCategories)
    .values({ key, name, isSystem: false, sortOrder: 200 })
    .returning()
  await logAudit(event, {
    action: 'create',
    entity: 'expense_category',
    entityId: rows[0].id,
    summary: `Tambah kategori pengeluaran "${rows[0].name}"`
  })
  return rows[0]
})
