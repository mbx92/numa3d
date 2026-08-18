import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

// Detail satu series beserta daftar produk yang bernaung di dalamnya.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.productSeries).where(eq(schema.productSeries.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Series tidak ditemukan' })

  const products = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      description: schema.products.description,
      status: schema.products.status,
      imageKey: schema.products.imageKey,
      stockQuantity: schema.products.stockQuantity
    })
    .from(schema.products)
    .where(eq(schema.products.seriesId, id))
    .orderBy(schema.products.name)

  return { ...rows[0], products }
})
