import { asc, eq, getTableColumns } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async () => {
  const db = useDb()
  return db.select({ ...getTableColumns(schema.materials), filamentTypeName: schema.filamentTypes.name })
    .from(schema.materials).leftJoin(schema.filamentTypes, eq(schema.materials.filamentTypeId, schema.filamentTypes.id))
    .orderBy(asc(schema.materials.name))
})
