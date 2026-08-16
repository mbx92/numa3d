import { and, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

// Rekap pengeluaran per kategori pada rentang tanggal.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const conds = []
  if (q.dateFrom) conds.push(gte(schema.expenses.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.expenses.date, q.dateTo))

  const rows = await db
    .select({ category: schema.expenses.category, amount: schema.expenses.amount })
    .from(schema.expenses)
    .where(conds.length ? and(...conds) : undefined)

  const total = rows.reduce((a, r) => a + r.amount, 0)
  const perCategory = new Map()
  for (const r of rows) {
    const agg = perCategory.get(r.category) || { category: r.category, count: 0, amount: 0 }
    agg.count += 1
    agg.amount += r.amount
    perCategory.set(r.category, agg)
  }

  return {
    total,
    entryCount: rows.length,
    categories: [...perCategory.values()]
      .map((c) => ({ ...c, percent: total ? Math.round((c.amount / total) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }
})
