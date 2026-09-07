import { and, gte, lte, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { getHppForProducts } from './productHpp.js'
import { loadCustomOrderHppMap } from './customOrders.js'
import { toDateStr } from './dates.js'
import { saleMoney } from './salePayment.js'
import { recordedOrLiveHpp } from './hpp.js'

export async function loadSalesWithHpp({ dateFrom, dateTo } = {}) {
  const db = useDb()
  const from = toDateStr(dateFrom)
  const to = toDateStr(dateTo)
  const conds = []
  if (from) conds.push(gte(schema.sales.date, from))
  if (to) conds.push(lte(schema.sales.date, to))

  const rows = await db
    .select({
      id: schema.sales.id,
      date: schema.sales.date,
      productId: schema.sales.productId,
      customOrderId: schema.sales.customOrderId,
      productName: sql`coalesce(${schema.products.name}, 'Custom · ' || ${schema.customOrders.customerName})`.as(
        'productName'
      ),
      quantity: schema.sales.quantity,
      salePricePerUnit: schema.sales.salePricePerUnit,
      hppPerUnit: schema.sales.hppPerUnit,
      channel: schema.sales.channel,
      marketplaceFeePercent: schema.sales.marketplaceFeePercent,
      discountAmount: schema.sales.discountAmount
    })
    .from(schema.sales)
    .leftJoin(schema.products, eq(schema.sales.productId, schema.products.id))
    .leftJoin(schema.customOrders, eq(schema.sales.customOrderId, schema.customOrders.id))
    .where(conds.length ? and(...conds) : undefined)

  const hppMap = await getHppForProducts([...new Set(rows.map((r) => r.productId))])
  const customHpp = await loadCustomOrderHppMap(rows.map((r) => r.customOrderId))

  return rows.map((r) => {
    const money = saleMoney(r)
    const liveTotal = r.customOrderId
      ? customHpp.get(r.customOrderId)?.total ?? 0
      : hppMap.get(r.productId)?.total ?? 0
    const hppPerUnit = recordedOrLiveHpp(r.hppPerUnit, liveTotal)
    const netPricePerUnit = r.quantity ? Math.round(money.net / r.quantity) : 0
    const totalHpp = hppPerUnit * r.quantity
    return {
      ...r,
      date: toDateStr(r.date) || r.date,
      isCustom: !!r.customOrderId,
      netPricePerUnit,
      hppPerUnit,
      grossRevenue: money.gross,
      netRevenue: money.net,
      totalHpp,
      feeAmount: money.fee,
      discountAmount: money.discount,
      netMargin: money.net - totalHpp
    }
  })
}

export function marginPercent(margin, revenue) {
  return revenue ? Math.round((margin / revenue) * 100) : 0
}
