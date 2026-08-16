import { gte } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { loadSalesWithHpp, marginPercent } from '../../utils/salesAggregate.js'

// Tren N bulan terakhir (default 12): revenue bersih, HPP, pengeluaran
// operasional, dan laba bersih per bulan. Konsisten dengan /reports/summary,
// pembelian material tidak dikurangkan (sudah terhitung di HPP).
export default defineEventHandler(async (event) => {
  const months = Math.min(Math.max(Number(getQuery(event).months) || 12, 1), 36)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`

  const db = useDb()
  const sales = await loadSalesWithHpp({ dateFrom: startStr })
  const expenses = await db
    .select({ date: schema.expenses.date, category: schema.expenses.category, amount: schema.expenses.amount })
    .from(schema.expenses)
    .where(gte(schema.expenses.date, startStr))

  // Siapkan seluruh bulan pada rentang agar bulan tanpa transaksi tetap muncul.
  const buckets = new Map()
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets.set(key, {
      month: key,
      units: 0,
      orders: 0,
      grossRevenue: 0,
      netRevenue: 0,
      cogs: 0,
      operatingExpenses: 0,
      materialPurchases: 0
    })
  }

  for (const s of sales) {
    const b = buckets.get(String(s.date).slice(0, 7))
    if (!b) continue
    b.units += s.quantity
    b.orders += 1
    b.grossRevenue += s.grossRevenue
    b.netRevenue += s.netRevenue
    b.cogs += s.totalHpp
  }
  for (const e of expenses) {
    const b = buckets.get(String(e.date).slice(0, 7))
    if (!b) continue
    if (e.category === 'material') b.materialPurchases += e.amount
    else b.operatingExpenses += e.amount
  }

  return [...buckets.values()].map((b) => {
    const grossProfit = b.netRevenue - b.cogs
    const netProfit = grossProfit - b.operatingExpenses
    return { ...b, grossProfit, netProfit, netProfitPercent: marginPercent(netProfit, b.netRevenue) }
  })
})
