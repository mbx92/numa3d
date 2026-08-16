import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const rows = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Supplier tidak ditemukan' })
  await db.delete(schema.suppliers).where(eq(schema.suppliers.id, id))
  await logAudit(event, { action: 'delete', entity: 'supplier', entityId: id, summary: `Hapus supplier "${rows[0].name}"` })
  return { ok: true }
})
