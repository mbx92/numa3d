import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const conditions = []
  if (query.status) conditions.push(eq(schema.orders.status, query.status))
  if (query.dateFrom) conditions.push(gte(schema.orders.date, query.dateFrom))
  if (query.dateTo) conditions.push(lte(schema.orders.date, query.dateTo))

  return useDb()
    .select({
      id: schema.orders.id,
      date: schema.orders.date,
      customerName: schema.orders.customerName,
      channel: schema.orders.channel,
      status: schema.orders.status,
      notes: schema.orders.notes,
      createdAt: schema.orders.createdAt,
      itemId: schema.orderItems.id,
      productId: schema.orderItems.productId,
      productName: schema.products.name,
      productStatus: schema.products.status,
      productKind: schema.products.kind,
      quantity: schema.orderItems.quantity,
      quantityReserved: schema.orderItems.quantityReserved,
      pricePerUnit: schema.orderItems.pricePerUnit,
      hppPerUnit: schema.orderItems.hppPerUnit,
      stockQuantity: schema.products.stockQuantity
    })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.orders.date), desc(schema.orders.id))
})
