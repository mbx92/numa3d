import { asc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(() => useDb().select().from(schema.filamentTypes).orderBy(asc(schema.filamentTypes.name)))
