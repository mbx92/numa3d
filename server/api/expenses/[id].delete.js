import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id))
  await db.delete(schema.expenses).where(eq(schema.expenses.id, id))
  await logAudit(event, { action: 'delete', entity: 'expense', entityId: id, summary: `Hapus pengeluaran "${existing[0]?.description || id}"` })
  return { ok: true }
})
