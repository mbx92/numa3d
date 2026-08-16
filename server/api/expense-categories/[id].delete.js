import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const [row] = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Kategori tidak ditemukan' })
  if (row.isSystem) throw createError({ statusCode: 400, statusMessage: 'Kategori bawaan tidak bisa dihapus' })
  const used = await db.select({ id: schema.expenses.id }).from(schema.expenses).where(eq(schema.expenses.category, row.key)).limit(1)
  if (used.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Kategori "${row.name}" masih dipakai pengeluaran. Pindahkan dulu ke kategori lain.`
    })
  }
  await db.delete(schema.expenseCategories).where(eq(schema.expenseCategories.id, id))
  await logAudit(event, {
    action: 'delete',
    entity: 'expense_category',
    entityId: id,
    summary: `Hapus kategori pengeluaran "${row.name}"`
  })
  return { ok: true }
})
