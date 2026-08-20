import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'
import { listProductImages } from '../../../../utils/productImages.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const [product] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, id))
  if (!product) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
  return listProductImages(db, schema, id)
})
