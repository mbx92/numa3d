import { useDb, schema } from '../../db/index.js'
import { logAudit } from '../../utils/audit.js'
import { sanitizeText } from '../../../utils/sanitizeText.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = sanitizeText(body.name || '')
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Nama supplier wajib diisi' })
  const notes = body.notes ? sanitizeText(body.notes) || null : null
  const db = useDb()
  try {
    const rows = await db
      .insert(schema.suppliers)
      .values({ name, notes })
      .returning()
    await logAudit(event, { action: 'create', entity: 'supplier', entityId: rows[0].id, summary: `Tambah supplier "${rows[0].name}"` })
    return rows[0]
  } catch (e) {
    if (e.code === '23505') throw createError({ statusCode: 400, statusMessage: 'Supplier dengan nama ini sudah ada' })
    throw e
  }
})
