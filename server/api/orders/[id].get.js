import { desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const [row] = await db
    .select({ order: schema.orders, item: schema.orderItems, product: schema.products })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .innerJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
    .where(eq(schema.orders.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Order tidak ditemukan' })

  const productions = await db
    .select()
    .from(schema.productions)
    .where(eq(schema.productions.orderItemId, row.item.id))
    .orderBy(desc(schema.productions.id))
  const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.orderId, id))
  return { ...row.order, item: { ...row.item, product: row.product }, productions, sale: sale || null }
})
