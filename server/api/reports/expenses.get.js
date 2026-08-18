import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { toDateStr } from '../../utils/dates.js'

// Rekap pengeluaran per kategori + daftar entri pada rentang tanggal.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const dateFrom = toDateStr(q.dateFrom)
  const dateTo = toDateStr(q.dateTo)
  const conds = []
  if (dateFrom) conds.push(gte(schema.expenses.date, dateFrom))
  if (dateTo) conds.push(lte(schema.expenses.date, dateTo))

  const rows = await db
    .select({
      id: schema.expenses.id,
      date: schema.expenses.date,
      category: schema.expenses.category,
      categoryName: schema.expenseCategories.name,
      description: schema.expenses.description,
      amount: schema.expenses.amount
    })
    .from(schema.expenses)
    .leftJoin(schema.expenseCategories, eq(schema.expenses.category, schema.expenseCategories.key))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.expenses.date), desc(schema.expenses.id))

  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0)
  const perCategory = new Map()
  for (const r of rows) {
    const key = r.category || 'other'
    const agg = perCategory.get(key) || {
      category: key,
      name: r.categoryName || key,
      count: 0,
      amount: 0
    }
    if (!agg.name && r.categoryName) agg.name = r.categoryName
    agg.count += 1
    agg.amount += Number(r.amount) || 0
    perCategory.set(key, agg)
  }

  return {
    total,
    entryCount: rows.length,
    categories: [...perCategory.values()]
      .map((c) => ({
        ...c,
        percent: total ? Math.round((c.amount / total) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount),
    entries: rows.map((r) => ({
      id: r.id,
      date: toDateStr(r.date) || r.date,
      category: r.category,
      categoryName: r.categoryName || r.category,
      description: r.description,
      amount: Number(r.amount) || 0
    }))
  }
})
