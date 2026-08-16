import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body.name) throw createError({ statusCode: 400, statusMessage: 'Nama wajib diisi' })
  const db = useDb()
  const rows = await db
    .insert(schema.packaging)
    .values({
      name: body.name,
      unit: body.unit || 'pcs',
      pricePerUnit: Math.round(Number(body.pricePerUnit) || 0),
      stockQuantity: Number(body.stockQuantity) || 0,
      supplier: body.supplier || null
    })
    .returning()
  await logAudit(event, { action: 'create', entity: 'packaging', entityId: rows[0].id, summary: `Tambah packaging "${rows[0].name}"` })
  return rows[0]
})
