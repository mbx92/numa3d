import { and, eq, gte, lte, desc, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { getHppForProducts } from '../../utils/productHpp.js'
import { loadCustomOrderHppMap } from '../../utils/customOrders.js'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const conds = []
  if (q.productId) conds.push(eq(schema.sales.productId, Number(q.productId)))
  if (q.channel) conds.push(eq(schema.sales.channel, q.channel))
  if (q.dateFrom) conds.push(gte(schema.sales.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.sales.date, q.dateTo))

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
      channel: schema.sales.channel,
      marketplaceFeePercent: schema.sales.marketplaceFeePercent,
      notes: schema.sales.notes,
      invoiceNumber: schema.sales.invoiceNumber,
      customerName: sql`coalesce(${schema.sales.customerName}, ${schema.customOrders.customerName})`.as('customerName')
    })
    .from(schema.sales)
    .leftJoin(schema.products, eq(schema.sales.productId, schema.products.id))
    .leftJoin(schema.customOrders, eq(schema.sales.customOrderId, schema.customOrders.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.sales.date), desc(schema.sales.id))

  const hppMap = await getHppForProducts([...new Set(rows.map((r) => r.productId))])
  const customHpp = await loadCustomOrderHppMap(rows.map((r) => r.customOrderId))

  return rows.map((r) => {
    const fee = r.marketplaceFeePercent || 0
    const netPricePerUnit = Math.round(r.salePricePerUnit * (1 - fee / 100))
    const hpp = r.customOrderId ? customHpp.get(r.customOrderId)?.total ?? 0 : hppMap.get(r.productId)?.total ?? 0
    return {
      ...r,
      isCustom: !!r.customOrderId,
      netPricePerUnit,
      grossRevenue: r.salePricePerUnit * r.quantity,
      netRevenue: netPricePerUnit * r.quantity,
      hppPerUnit: hpp,
      netMargin: (netPricePerUnit - hpp) * r.quantity
    }
  })
})
