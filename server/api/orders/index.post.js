import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { parseOrderBody } from '../../utils/orders.js'
import { getHppForProduct } from '../../utils/productHpp.js'

export default defineEventHandler(async (event) => {
  const parsed = parseOrderBody(await readBody(event))
  const hpp = await getHppForProduct(parsed.item.productId)
  const db = useDb()
  const created = await db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: schema.products.id, listPrice: schema.products.listPrice })
      .from(schema.products)
      .where(eq(schema.products.id, parsed.item.productId))
    if (!product) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
    const [order] = await tx.insert(schema.orders).values(parsed.order).returning()
    const [item] = await tx
      .insert(schema.orderItems)
      .values({
        ...parsed.item,
        orderId: order.id,
        pricePerUnit: parsed.item.pricePerUnit || product.listPrice || 0,
        hppPerUnit: Math.max(Math.round(Number(hpp?.total) || 0), 0)
      })
      .returning()
    return { ...order, item }
  })
  await logAudit(event, {
    action: 'create',
    entity: 'order',
    entityId: created.id,
    summary: `Order #${created.id} untuk ${created.customerName}`
  })
  return created
})
