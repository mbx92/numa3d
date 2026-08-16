import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body.date) throw createError({ statusCode: 400, statusMessage: 'Tanggal wajib diisi' })
  if (Number(body.amount) <= 0) throw createError({ statusCode: 400, statusMessage: 'Jumlah harus lebih dari 0' })
  const db = useDb()
  const rows = await db
    .insert(schema.capitalTransactions)
    .values({
      date: body.date,
      type: body.type || 'deposit',
      amount: Math.round(Number(body.amount) || 0),
      notes: body.notes || null
    })
    .returning()
  const r = rows[0]
  const label = r.type === 'deposit' ? 'setoran' : 'penarikan'
  await logAudit(event, {
    action: 'create',
    entity: 'capital',
    entityId: r.id,
    summary: `Catat ${label} modal (Rp ${r.amount.toLocaleString('id-ID')})`
  })
  return r
})
