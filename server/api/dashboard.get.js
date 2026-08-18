import { and, gte, lte, lt, eq, count, inArray } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { loadSalesWithHpp, marginPercent } from '../utils/salesAggregate.js'
import { localDateStr, monthStartStr } from '../utils/dates.js'
import { isOperatingExpenseCategory } from '../utils/expensePl.js'

const MATERIAL_LOW_STOCK = 200
const PACKAGING_LOW_STOCK = 10
const PRODUCT_LOW_STOCK = 3

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function previousPeriod(now) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const day = now.getDate()
  const prev = new Date(y, m - 1, 1)
  const maxDay = lastDayOfMonth(prev.getFullYear(), prev.getMonth())
  const prevDay = Math.min(day, maxDay)
  return {
    from: monthStartStr(prev),
    to: localDateStr(new Date(prev.getFullYear(), prev.getMonth(), prevDay))
  }
}

function plFrom(sales, expenses) {
  const grossRevenue = sales.reduce((a, s) => a + s.grossRevenue, 0)
  const netRevenue = sales.reduce((a, s) => a + s.netRevenue, 0)
  const marketplaceFees = sales.reduce((a, s) => a + s.feeAmount, 0)
  const cogs = sales.reduce((a, s) => a + s.totalHpp, 0)
  const grossProfit = netRevenue - cogs
  const materialPurchases = expenses.filter((e) => e.category === 'material').reduce((a, e) => a + e.amount, 0)
  const operatingExpenses = expenses.filter((e) => isOperatingExpenseCategory(e.category)).reduce((a, e) => a + e.amount, 0)
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
    materialPurchases,
    totalCashOut: expenses.reduce((a, e) => a + e.amount, 0),
    netProfit,
    netProfitPercent: marginPercent(netProfit, netRevenue)
  }
}

function pctChange(cur, prev) {
  if (prev == null || prev === 0) return cur ? 100 : 0
  return Math.round(((cur - prev) / Math.abs(prev)) * 100)
}

export default defineEventHandler(async () => {
  const db = useDb()
  const now = new Date()
  const monthStart = monthStartStr(now)
  const monthEnd = localDateStr(now)
  const prev = previousPeriod(now)

  const [sales, prevSales] = await Promise.all([
    loadSalesWithHpp({ dateFrom: monthStart, dateTo: monthEnd }),
    loadSalesWithHpp({ dateFrom: prev.from, dateTo: prev.to })
  ])

  const [expenseRows, prevExpenseRows] = await Promise.all([
    db
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
      .where(and(gte(schema.expenses.date, monthStart), lte(schema.expenses.date, monthEnd))),
    db
      .select({ category: schema.expenses.category, amount: schema.expenses.amount })
      .from(schema.expenses)
      .where(and(gte(schema.expenses.date, prev.from), lte(schema.expenses.date, prev.to)))
  ])

  const pl = plFrom(sales, expenseRows)
  const prevPl = plFrom(prevSales, prevExpenseRows)

  const catMap = new Map()
  for (const e of expenseRows) {
    const key = e.category || 'other'
    const agg = catMap.get(key) || { category: key, name: e.categoryName || key, amount: 0, count: 0 }
    agg.amount += e.amount
    agg.count += 1
    catMap.set(key, agg)
  }
  const expensesByCategory = [...catMap.values()].sort((a, b) => b.amount - a.amount)
  const maxCat = Math.max(...expensesByCategory.map((c) => c.amount), 1)

  const channelMap = new Map()
  for (const s of sales) {
    const agg = channelMap.get(s.channel) || { channel: s.channel, units: 0, netRevenue: 0, orders: 0 }
    agg.units += s.quantity
    agg.netRevenue += s.netRevenue
    agg.orders += 1
    channelMap.set(s.channel, agg)
  }
  const channels = [...channelMap.values()].sort((a, b) => b.netRevenue - a.netRevenue)

  const perProduct = new Map()
  for (const s of sales) {
    const agg = perProduct.get(s.productId) || {
      productId: s.productId,
      productName: s.productName,
      units: 0,
      netRevenue: 0,
      margin: 0
    }
    agg.units += s.quantity
    agg.netRevenue += s.netRevenue
    agg.margin += s.netMargin
    perProduct.set(s.productId, agg)
  }
  const topProducts = [...perProduct.values()].sort((a, b) => b.margin - a.margin).slice(0, 5)

  const recentSales = [...sales]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .slice(0, 6)
    .map((s) => ({
      id: s.id,
      date: s.date,
      productName: s.productName,
      quantity: s.quantity,
      channel: s.channel,
      netRevenue: s.netRevenue
    }))

  const recentExpenses = [...expenseRows]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      date: e.date,
      description: e.description,
      category: e.category,
      categoryName: e.categoryName,
      amount: e.amount
    }))

  const purchaseRows = await db
    .select({
      totalAmount: schema.supplierPurchases.totalAmount
    })
    .from(schema.supplierPurchases)
    .where(and(gte(schema.supplierPurchases.date, monthStart), lte(schema.supplierPurchases.date, monthEnd)))

  const [lowMaterials, lowPackaging, lowProducts, materialsCount, packagingCount, productCounts, seriesCount, machineCount, productionOpen, capitalRows, allSales, allExpenses, machinePrices] =
    await Promise.all([
      db.select().from(schema.materials).where(lt(schema.materials.stockQuantity, MATERIAL_LOW_STOCK)),
      db.select().from(schema.packaging).where(lt(schema.packaging.stockQuantity, PACKAGING_LOW_STOCK)),
      db
        .select({
          id: schema.products.id,
          name: schema.products.name,
          stockQuantity: schema.products.stockQuantity
        })
        .from(schema.products)
        .where(and(eq(schema.products.status, 'active'), lt(schema.products.stockQuantity, PRODUCT_LOW_STOCK))),
      db.select({ c: count() }).from(schema.materials),
      db.select({ c: count() }).from(schema.packaging),
      db
        .select({ status: schema.products.status, c: count() })
        .from(schema.products)
        .groupBy(schema.products.status),
      db.select({ c: count() }).from(schema.productSeries),
      db.select({ c: count() }).from(schema.machines),
      db
        .select({ c: count() })
        .from(schema.productions)
        .where(inArray(schema.productions.status, ['queued', 'in_progress'])),
      db.select({ type: schema.capitalTransactions.type, amount: schema.capitalTransactions.amount }).from(schema.capitalTransactions),
      db
        .select({
          quantity: schema.sales.quantity,
          salePricePerUnit: schema.sales.salePricePerUnit,
          marketplaceFeePercent: schema.sales.marketplaceFeePercent
        })
        .from(schema.sales),
      db.select({ amount: schema.expenses.amount }).from(schema.expenses),
      db.select({ price: schema.machines.purchasePrice, expenseId: schema.machines.expenseId }).from(schema.machines)
    ])

  const productsByStatus = { draft: 0, active: 0, rnd: 0, discontinued: 0 }
  let productsTotal = 0
  for (const r of productCounts) {
    productsByStatus[r.status] = r.c
    productsTotal += r.c
  }

  const totalDeposit = capitalRows.filter((r) => r.type === 'deposit').reduce((a, r) => a + r.amount, 0)
  const totalWithdrawal = capitalRows.filter((r) => r.type === 'withdrawal').reduce((a, r) => a + r.amount, 0)
  const netCapital = totalDeposit - totalWithdrawal
  const salesNetAll = allSales.reduce(
    (a, s) => a + Math.round(s.salePricePerUnit * (1 - (s.marketplaceFeePercent || 0) / 100)) * s.quantity,
    0
  )
  const expensesAll = allExpenses.reduce((a, r) => a + r.amount, 0)
  const unlinkedMachinePurchases = machinePrices.filter((r) => !r.expenseId).reduce((a, r) => a + r.price, 0)

  return {
    month: monthStart.slice(0, 7),
    range: { from: monthStart, to: monthEnd },
    prevRange: prev,
    pl,
    vsPrev: {
      netRevenue: pctChange(pl.netRevenue, prevPl.netRevenue),
      netProfit: pctChange(pl.netProfit, prevPl.netProfit),
      unitsSold: pctChange(pl.unitsSold, prevPl.unitsSold),
      totalCashOut: pctChange(pl.totalCashOut, prevPl.totalCashOut)
    },
    expensesByCategory: expensesByCategory.map((c) => ({
      ...c,
      percent: Math.round((c.amount / maxCat) * 100)
    })),
    channels,
    topProducts,
    recentSales,
    recentExpenses,
    purchases: {
      count: purchaseRows.length,
      amount: purchaseRows.reduce((a, r) => a + r.totalAmount, 0)
    },
    lowMaterials,
    lowPackaging,
    lowProducts,
    productionOpen: productionOpen[0]?.c || 0,
    inventory: {
      materials: materialsCount[0]?.c || 0,
      packaging: packagingCount[0]?.c || 0,
      products: productsTotal,
      productsActive: productsByStatus.active,
      productsRnd: productsByStatus.rnd,
      productsDraft: productsByStatus.draft,
      productsDiscontinued: productsByStatus.discontinued,
      series: seriesCount[0]?.c || 0,
      machines: machineCount[0]?.c || 0
    },
    capital: {
      netCapital,
      estimatedCash: netCapital + salesNetAll - expensesAll - unlinkedMachinePurchases
    }
  }
})
