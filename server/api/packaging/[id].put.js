import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const db = useDb()
  const rows = await db
    .update(schema.packaging)
    .set({
      name: body.name,
      unit: body.unit,
      pricePerUnit: Math.round(Number(body.pricePerUnit) || 0),
      stockQuantity: Number(body.stockQuantity) || 0,
      supplier: body.supplier || null
    })
    .where(eq(schema.packaging.id, id))
    .returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Packaging tidak ditemukan' })
  await logAudit(event, { action: 'update', entity: 'packaging', entityId: id, summary: `Ubah packaging "${rows[0].name}"` })
  return rows[0]
})
