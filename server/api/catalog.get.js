import { asc, sql, inArray } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { getHppForProducts } from '../utils/productHpp.js'
import { getSettings } from '../utils/settings.js'
import { decorateProductPricing } from '../utils/productPricing.js'

// Katalog produk: kartu produk lengkap dengan foto, HPP, harga jual,
// dan performa penjualan sepanjang waktu (unit terjual + margin).
export default defineEventHandler(async () => {
  const db = useDb()
  const settings = await getSettings()
  const products = await db.select().from(schema.products).orderBy(asc(schema.products.name))
  if (!products.length) return []

  const ids = products.map((p) => p.id)
  const hppMap = await getHppForProducts(ids)

  const soldRows = await db
    .select({
      productId: schema.sales.productId,
      units: sql`sum(${schema.sales.quantity})`,
      grossRevenue: sql`sum(${schema.sales.quantity} * ${schema.sales.salePricePerUnit})`,
      lastSoldAt: sql`max(${schema.sales.date})`
    })
    .from(schema.sales)
    .where(inArray(schema.sales.productId, ids))
    .groupBy(schema.sales.productId)
  const soldMap = new Map(soldRows.map((r) => [r.productId, r]))

  const fileRows = await db
    .select({ productId: schema.productFiles.productId, count: sql`count(*)` })
    .from(schema.productFiles)
    .where(inArray(schema.productFiles.productId, ids))
    .groupBy(schema.productFiles.productId)
  const fileMap = new Map(fileRows.map((r) => [r.productId, Number(r.count)]))

  return products.map((p) => {
    const hpp = hppMap.get(p.id)
    const sold = soldMap.get(p.id)
    const pricing = decorateProductPricing(p, hpp, settings)
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      imageKey: p.imageKey,
      stockQuantity: p.stockQuantity || 0,
      ...pricing,
      fileCount: fileMap.get(p.id) || 0,
      unitsSold: Number(sold?.units || 0),
      grossRevenue: Number(sold?.grossRevenue || 0),
      lastSoldAt: sold?.lastSoldAt || null
    }
  })
})
