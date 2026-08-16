import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  await db.delete(schema.sales).where(eq(schema.sales.id, id))
  await logAudit(event, { action: 'delete', entity: 'sale', entityId: id, summary: `Hapus penjualan id ${id}` })
  return { ok: true }
})
