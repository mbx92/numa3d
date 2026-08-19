import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  return db
    .select()
    .from(schema.customOrderFiles)
    .where(eq(schema.customOrderFiles.customOrderId, id))
})
