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
    .update(schema.productSeries)
    .set({
      name: body.name,
      description: body.description || null
    })
    .where(eq(schema.productSeries.id, id))
    .returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Series tidak ditemukan' })
  await logAudit(event, { action: 'update', entity: 'product_series', entityId: id, summary: `Ubah series "${rows[0].name}"` })
  return rows[0]
})
