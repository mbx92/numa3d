import { asc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async () => {
  const db = useDb()
  return db.select().from(schema.materials).orderBy(asc(schema.materials.name))
})
