import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const seriesId = body.seriesId === '' || body.seriesId == null ? null : Number(body.seriesId)
  const db = useDb()
  const rows = await db
    .update(schema.products)
    .set({
      name: body.name,
      description: body.description || null,
      status: body.status,
      seriesId: Number.isInteger(seriesId) && seriesId > 0 ? seriesId : null
    })

    .where(eq(schema.products.id, id))
    .returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
  await logAudit(event, { action: 'update', entity: 'product', entityId: id, summary: `Ubah info produk "${rows[0].name}"` })
  return rows[0]
})
