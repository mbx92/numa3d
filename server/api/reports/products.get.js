import { loadSalesWithHpp, marginPercent } from '../../utils/salesAggregate.js'

// Ringkasan per produk: unit terjual, revenue kotor/bersih, total HPP, margin.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const sales = await loadSalesWithHpp({ dateFrom: q.dateFrom, dateTo: q.dateTo })

  const perProduct = new Map()
  for (const s of sales) {
    const key = s.customOrderId ? `custom:${s.customOrderId}` : s.productId
    const agg = perProduct.get(key) || {
      productId: s.productId,
      customOrderId: s.customOrderId || null,
      productName: s.productName || (s.customOrderId ? 'Custom' : '(produk terhapus)'),
      hppPerUnit: s.hppPerUnit,
      units: 0,
      orders: 0,
      grossRevenue: 0,
      netRevenue: 0,
      totalHpp: 0
    }
    agg.units += s.quantity
    agg.orders += 1
    agg.grossRevenue += s.grossRevenue
    agg.netRevenue += s.netRevenue
    agg.totalHpp += s.totalHpp
    perProduct.set(key, agg)
  }

  return [...perProduct.values()]
    .map((p) => ({
      ...p,
      avgSalePrice: p.units ? Math.round(p.grossRevenue / p.units) : 0,
      grossMargin: p.grossRevenue - p.totalHpp,
      netMargin: p.netRevenue - p.totalHpp,
      netMarginPercent: marginPercent(p.netRevenue - p.totalHpp, p.netRevenue)
    }))
    .sort((a, b) => b.netMargin - a.netMargin)
})
