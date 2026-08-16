import { and, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { loadSalesWithHpp, marginPercent } from '../../utils/salesAggregate.js'

// Ringkasan laba rugi.
//
// Pembelian material (kategori expense "material") SENGAJA tidak dikurangkan
// dari laba: biaya material sudah masuk HPP per unit yang terjual. Kalau
// keduanya dikurangkan, biaya material terhitung dua kali. Pembelian material
// tetap dilaporkan terpisah sebagai arus kas keluar.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const sales = await loadSalesWithHpp({ dateFrom: q.dateFrom, dateTo: q.dateTo })

  const conds = []
  if (q.dateFrom) conds.push(gte(schema.expenses.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.expenses.date, q.dateTo))
  const expenses = await db
    .select({ category: schema.expenses.category, amount: schema.expenses.amount })
    .from(schema.expenses)
    .where(conds.length ? and(...conds) : undefined)

  const grossRevenue = sales.reduce((a, s) => a + s.grossRevenue, 0)
  const netRevenue = sales.reduce((a, s) => a + s.netRevenue, 0)
  const marketplaceFees = sales.reduce((a, s) => a + s.feeAmount, 0)
  const cogs = sales.reduce((a, s) => a + s.totalHpp, 0)
  const grossProfit = netRevenue - cogs

  const byCategory = {}
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  const materialPurchases = byCategory.material || 0
  const operatingExpenses = expenses
    .filter((e) => e.category !== 'material')
    .reduce((a, e) => a + e.amount, 0)
  const netProfit = grossProfit - operatingExpenses

  return {
    unitsSold: sales.reduce((a, s) => a + s.quantity, 0),
    orderCount: sales.length,
    grossRevenue,
    marketplaceFees,
    netRevenue,
    cogs,
    grossProfit,
    grossProfitPercent: marginPercent(grossProfit, netRevenue),
    operatingExpenses,
    netProfit,
    netProfitPercent: marginPercent(netProfit, netRevenue),
    materialPurchases,
    totalCashOut: materialPurchases + operatingExpenses,
    expensesByCategory: byCategory
  }
})
