import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { streamImage } from '../../../utils/image.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db
    .select({ imageKey: schema.productSeries.imageKey })
    .from(schema.productSeries)
    .where(eq(schema.productSeries.id, id))
  if (!rows.length || !rows[0].imageKey) {
    throw createError({ statusCode: 404, statusMessage: 'Gambar tidak ada' })
  }
  return streamImage(event, rows[0].imageKey)
})
