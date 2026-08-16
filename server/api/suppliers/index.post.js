import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = String(body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Nama supplier wajib diisi' })
  const db = useDb()
  try {
    const rows = await db
      .insert(schema.suppliers)
      .values({ name, notes: body.notes ? String(body.notes).trim() : null })
      .returning()
    await logAudit(event, { action: 'create', entity: 'supplier', entityId: rows[0].id, summary: `Tambah supplier "${rows[0].name}"` })
    return rows[0]
  } catch (e) {
    if (e.code === '23505') throw createError({ statusCode: 400, statusMessage: 'Supplier dengan nama ini sudah ada' })
    throw e
  }
})
