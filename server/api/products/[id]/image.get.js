import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { streamImage } from '../../../utils/image.js'
import { listProductImages } from '../../../utils/productImages.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db
    .select({ imageKey: schema.products.imageKey })
    .from(schema.products)
    .where(eq(schema.products.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Gambar tidak ada' })
  let key = rows[0].imageKey
  if (!key) {
    const imgs = await listProductImages(db, schema, id)
    key = imgs[0]?.objectKey || null
  }
  if (!key) throw createError({ statusCode: 404, statusMessage: 'Gambar tidak ada' })
  return streamImage(event, key)
})
