import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body.name) throw createError({ statusCode: 400, statusMessage: 'Nama series wajib diisi' })
  const db = useDb()
  const rows = await db
    .insert(schema.productSeries)
    .values({
      name: body.name,
      description: body.description || null
    })
    .returning()
  await logAudit(event, { action: 'create', entity: 'product_series', entityId: rows[0].id, summary: `Tambah series "${rows[0].name}"` })
  return rows[0]
})
