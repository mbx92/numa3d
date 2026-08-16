import { and, gte, lte, eq, desc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

// Daftar mutasi modal + ringkasan posisi modal & estimasi kas.
//
// Estimasi kas dihitung sebagai: modal bersih (setoran - penarikan)
//   + revenue bersih kumulatif (harga jual - fee marketplace)
//   - total pengeluaran (semua kategori)
//   - total pembelian mesin (aset yang dibeli dari modal awal)
// Angka ini perkiraan sederhana posisi kas, bukan laporan akuntansi penuh.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()

  const conds = []
  if (q.type) conds.push(eq(schema.capitalTransactions.type, q.type))
  if (q.dateFrom) conds.push(gte(schema.capitalTransactions.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.capitalTransactions.date, q.dateTo))

  const transactions = await db
    .select()
    .from(schema.capitalTransactions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.capitalTransactions.date), desc(schema.capitalTransactions.id))

  const totalDeposit = transactions
    .filter((r) => r.type === 'deposit')
    .reduce((a, r) => a + r.amount, 0)
  const totalWithdrawal = transactions
    .filter((r) => r.type === 'withdrawal')
    .reduce((a, r) => a + r.amount, 0)

  // Revenue bersih kumulatif (semua periode).
  const salesRows = await db
    .select({
      quantity: schema.sales.quantity,
      salePricePerUnit: schema.sales.salePricePerUnit,
      marketplaceFeePercent: schema.sales.marketplaceFeePercent
    })
    .from(schema.sales)
  const salesNetRevenue = salesRows.reduce(
    (a, s) => a + Math.round(s.salePricePerUnit * (1 - (s.marketplaceFeePercent || 0) / 100)) * s.quantity,
    0
  )

  // Total pengeluaran & pembelian mesin (semua periode).
  const expenseRows = await db.select({ amount: schema.expenses.amount }).from(schema.expenses)
  const totalExpenses = expenseRows.reduce((a, r) => a + r.amount, 0)
  const machineRows = await db.select({ price: schema.machines.purchasePrice }).from(schema.machines)
  const machinePurchases = machineRows.reduce((a, r) => a + r.price, 0)

  const netCapital = totalDeposit - totalWithdrawal

  return {
    transactions,
    summary: {
      totalDeposit,
      totalWithdrawal,
      netCapital,
      salesNetRevenue,
      totalExpenses,
      machinePurchases,
      estimatedCash: netCapital + salesNetRevenue - totalExpenses - machinePurchases
    }
  }
})
