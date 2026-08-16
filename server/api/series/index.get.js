import { asc, sql, eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

// Daftar series (untuk halaman Katalog). Setiap series disertai jumlah produk.
export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db
    .select({
      id: schema.productSeries.id,
      name: schema.productSeries.name,
      description: schema.productSeries.description,
      imageKey: schema.productSeries.imageKey,
      createdAt: schema.productSeries.createdAt,
      productCount: sql`count(${schema.products.id})::int`
    })
    .from(schema.productSeries)
    .leftJoin(schema.products, eq(schema.products.seriesId, schema.productSeries.id))
    .groupBy(
      schema.productSeries.id,
      schema.productSeries.name,
      schema.productSeries.description,
      schema.productSeries.imageKey,
      schema.productSeries.createdAt
    )
    .orderBy(asc(schema.productSeries.name))
  return rows
})
