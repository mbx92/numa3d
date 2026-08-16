import { asc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { publicMachine } from '../../utils/tuyaLocal.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.select().from(schema.machines).orderBy(asc(schema.machines.name))
  return rows.map(publicMachine)
})
