import { asc, eq, inArray, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { getHppForProducts } from '../../utils/productHpp.js'
import { getSettings } from '../../utils/settings.js'
import { decorateProductPricing } from '../../utils/productPricing.js'
import { ACTIVE_ORDER_STATUSES } from '../../utils/orders.js'
import { getProductPreviewMap, withProductPreview } from '../../utils/productPreviews.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const settings = await getSettings()
  const products = await db.select().from(schema.products).orderBy(asc(schema.products.name))
  const reservationRows = await db
    .select({
      productId: schema.orderItems.productId,
      quantity: sql`coalesce(sum(${schema.orderItems.quantityReserved}), 0)::int`
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(inArray(schema.orders.status, ACTIVE_ORDER_STATUSES))
    .groupBy(schema.orderItems.productId)
  const reservationMap = new Map(reservationRows.map((row) => [row.productId, Number(row.quantity) || 0]))
  const hppMap = await getHppForProducts(products.map((p) => p.id))
  const previews = await getProductPreviewMap(db, products.map((p) => p.id))
  return products.map((p) => {
    const hpp = hppMap.get(p.id)
    const printMinutesPerUnit = (hpp?.recipeRows || []).reduce(
      (max, r) => Math.max(max, r.printTimeMinutes || 0),
      0
    )
    const reservedQuantity = reservationMap.get(p.id) || 0
    return withProductPreview({
      ...p,
      ...decorateProductPricing(p, hpp, settings),
      reservedQuantity,
      availableStock: Math.max((Number(p.stockQuantity) || 0) - reservedQuantity, 0),
      printMinutesPerUnit
    }, previews)
  })
})
