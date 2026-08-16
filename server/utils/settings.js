import { useDb, schema } from '../db/index.js'

// Ambil baris settings tunggal, buat dengan default kalau belum ada.
export async function getSettings() {
  const db = useDb()
  const rows = await db.select().from(schema.appSettings).limit(1)
  if (rows.length) return rows[0]
  const inserted = await db.insert(schema.appSettings).values({}).returning()
  return inserted[0]
}
