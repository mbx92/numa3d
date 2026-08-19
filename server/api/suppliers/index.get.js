import { asc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { sanitizeText } from '../../utils/sanitizeText.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name))
  return rows.map((s) => ({
    ...s,
    name: sanitizeText(s.name) || s.name,
    notes: s.notes ? sanitizeText(s.notes) : s.notes
  }))
})
