import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { getHppForProducts } from '../../utils/productHpp.js'
import { getSettings } from '../../utils/settings.js'
import { decorateProductPricing } from '../../utils/productPricing.js'

// Detail satu series beserta daftar produk yang bernaung di dalamnya.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.productSeries).where(eq(schema.productSeries.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Series tidak ditemukan' })

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.seriesId, id))
    .orderBy(schema.products.name)
  const settings = await getSettings()
  const hppMap = await getHppForProducts(products.map((p) => p.id))

  return {
    ...rows[0],
    products: products.map((p) => ({
      ...p,
      ...decorateProductPricing(p, hppMap.get(p.id), settings)
    }))
  }
})
