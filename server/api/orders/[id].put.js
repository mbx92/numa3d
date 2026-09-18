import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { parseOrderBody } from '../../utils/orders.js'
import { getHppForProduct } from '../../utils/productHpp.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const parsed = parseOrderBody(await readBody(event))
  const hpp = await getHppForProduct(parsed.item.productId)
  const db = useDb()
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id))
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Order tidak ditemukan' })
    if (existing.status !== 'draft') {
      throw createError({ statusCode: 400, statusMessage: 'Hanya order draft yang bisa diubah' })
    }
    const [product] = await tx
      .select({ id: schema.products.id, listPrice: schema.products.listPrice })
      .from(schema.products)
      .where(eq(schema.products.id, parsed.item.productId))
    if (!product) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
    const [order] = await tx.update(schema.orders).set(parsed.order).where(eq(schema.orders.id, id)).returning()
    await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, id))
    const [item] = await tx.insert(schema.orderItems).values({
      ...parsed.item,
      orderId: id,
      pricePerUnit: parsed.item.pricePerUnit || product.listPrice || 0,
      hppPerUnit: Math.max(Math.round(Number(hpp?.total) || 0), 0)
    }).returning()
    return { ...order, item }
  })
  await logAudit(event, { action: 'update', entity: 'order', entityId: id, summary: `Ubah order #${id}` })
  return updated
})
