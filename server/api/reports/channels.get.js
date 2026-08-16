import { loadSalesWithHpp, marginPercent } from '../../utils/salesAggregate.js'

// Performa per channel penjualan: berapa yang terjual, berapa yang hilang ke
// fee marketplace, dan margin bersih yang benar-benar tersisa.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const sales = await loadSalesWithHpp({ dateFrom: q.dateFrom, dateTo: q.dateTo })

  const perChannel = new Map()
  for (const s of sales) {
    const agg = perChannel.get(s.channel) || {
      channel: s.channel,
      orders: 0,
      units: 0,
      grossRevenue: 0,
      feeAmount: 0,
      netRevenue: 0,
      totalHpp: 0
    }
    agg.orders += 1
    agg.units += s.quantity
    agg.grossRevenue += s.grossRevenue
    agg.feeAmount += s.feeAmount
    agg.netRevenue += s.netRevenue
    agg.totalHpp += s.totalHpp
    perChannel.set(s.channel, agg)
  }

  return [...perChannel.values()]
    .map((c) => ({
      ...c,
      avgOrderValue: c.orders ? Math.round(c.grossRevenue / c.orders) : 0,
      netMargin: c.netRevenue - c.totalHpp,
      netMarginPercent: marginPercent(c.netRevenue - c.totalHpp, c.netRevenue)
    }))
    .sort((a, b) => b.netMargin - a.netMargin)
})
