import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body.name) throw createError({ statusCode: 400, statusMessage: 'Nama wajib diisi' })
  const seriesId = body.seriesId === '' || body.seriesId == null ? null : Number(body.seriesId)
  const db = useDb()
  const rows = await db
    .insert(schema.products)
    .values({
      name: body.name,
      description: body.description || null,
      status: body.status || 'draft',
      seriesId: Number.isInteger(seriesId) && seriesId > 0 ? seriesId : null
    })

    .returning()
  await logAudit(event, { action: 'create', entity: 'product', entityId: rows[0].id, summary: `Tambah produk "${rows[0].name}"` })
  return rows[0]
})
