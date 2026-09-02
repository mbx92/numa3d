import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { parseMaterialType } from '../../utils/materialType.js'
import { parseMaterialColor } from '../../utils/materialColor.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const db = useDb()
  const rows = await db
    .update(schema.materials)
    .set({
      name: body.name,
      type: parseMaterialType(body.type, 'filament'),
      unit: body.unit,
      pricePerUnit: Math.round(Number(body.pricePerUnit) || 0),
      stockQuantity: Number(body.stockQuantity) || 0,
      supplier: body.supplier || null,
      color: parseMaterialColor(body.color)
    })
    .where(eq(schema.materials.id, id))
    .returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Material tidak ditemukan' })
  await logAudit(event, { action: 'update', entity: 'material', entityId: id, summary: `Ubah material "${rows[0].name}"` })
  return rows[0]
})
