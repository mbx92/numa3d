import { eq } from 'drizzle-orm'

export function slugifyCategory(name) {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'kategori'
}

export async function uniqueCategoryKey(db, schema, name) {
  const base = slugifyCategory(name)
  let key = base
  let n = 2
  for (;;) {
    const [row] = await db.select({ id: schema.expenseCategories.id }).from(schema.expenseCategories).where(eq(schema.expenseCategories.key, key))
    if (!row) return key
    key = `${base}-${n}`
    n += 1
  }
}

export async function assertExpenseCategory(db, schema, key) {
  const k = String(key || '').trim()
  if (!k) throw createError({ statusCode: 400, statusMessage: 'Kategori pengeluaran wajib dipilih' })
  const [row] = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.key, k))
  if (!row) throw createError({ statusCode: 400, statusMessage: 'Kategori pengeluaran tidak ditemukan' })
  return row
}
