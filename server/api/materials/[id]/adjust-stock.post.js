import { eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'

// Penyesuaian stok manual: body { delta } (positif = masuk, negatif = keluar).
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const delta = Number(body.delta) || 0
  const db = useDb()
  const rows = await db
    .update(schema.materials)
    .set({ stockQuantity: sql`GREATEST(${schema.materials.stockQuantity} + ${delta}, 0)` })
    .where(eq(schema.materials.id, id))
    .returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Material tidak ditemukan' })
  await logAudit(event, {
    action: 'update',
    entity: 'material',
    entityId: id,
    summary: `Sesuaikan stok "${rows[0].name}": ${delta >= 0 ? '+' : ''}${delta} ${rows[0].unit}`
  })
  return rows[0]
})
