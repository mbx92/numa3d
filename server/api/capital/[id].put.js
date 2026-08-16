import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  if (Number(body.amount) <= 0) throw createError({ statusCode: 400, statusMessage: 'Jumlah harus lebih dari 0' })
  const db = useDb()
  const rows = await db
    .update(schema.capitalTransactions)
    .set({
      date: body.date,
      type: body.type,
      amount: Math.round(Number(body.amount) || 0),
      notes: body.notes || null
    })
    .where(eq(schema.capitalTransactions.id, id))
    .returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Mutasi modal tidak ditemukan' })
  const r = rows[0]
  const label = r.type === 'deposit' ? 'setoran' : 'penarikan'
  await logAudit(event, {
    action: 'update',
    entity: 'capital',
    entityId: id,
    summary: `Ubah ${label} modal (Rp ${r.amount.toLocaleString('id-ID')})`
  })
  return r
})
