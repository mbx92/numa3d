import { asc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { getProductPreviewMap, withProductPreview } from '../../utils/productPreviews.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const products = await db.select({
    id: schema.products.id,
    name: schema.products.name,
    description: schema.products.description,
    kind: schema.products.kind,
    status: schema.products.status,
    imageKey: schema.products.imageKey
  }).from(schema.products).orderBy(asc(schema.products.name))

  const previews = await getProductPreviewMap(db, products.map((product) => product.id))
  return products.map((product) => withProductPreview(product, previews))
})
