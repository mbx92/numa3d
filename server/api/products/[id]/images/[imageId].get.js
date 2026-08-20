import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'
import { streamImage } from '../../../../utils/image.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const imageId = Number(getRouterParam(event, 'imageId'))
  const db = useDb()
  const [row] = await db
    .select()
    .from(schema.productImages)
    .where(and(eq(schema.productImages.id, imageId), eq(schema.productImages.productId, id)))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Gambar tidak ada' })
  return streamImage(event, row.objectKey)
})
