import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.capitalTransactions).where(eq(schema.capitalTransactions.id, id))
  await db.delete(schema.capitalTransactions).where(eq(schema.capitalTransactions.id, id))
  const r = existing[0]
  const label = r?.type === 'deposit' ? 'setoran' : 'penarikan'
  await logAudit(event, {
    action: 'delete',
    entity: 'capital',
    entityId: id,
    summary: `Hapus ${label} modal ${r ? `(Rp ${r.amount.toLocaleString('id-ID')})` : ''}`
  })
  return { ok: true }
})
