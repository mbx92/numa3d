import { eq, desc } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'

export default defineEventHandler(async (event) => {
  const productId = Number(getRouterParam(event, 'id'))
  const db = useDb()
  return db
    .select()
    .from(schema.productFiles)
    .where(eq(schema.productFiles.productId, productId))
    .orderBy(desc(schema.productFiles.createdAt))
})
