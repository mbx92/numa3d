import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { filamentTypeWriteError } from '../../utils/filamentTypes.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'ID jenis filament tidak valid' })
  let row
  try { [row] = await useDb().delete(schema.filamentTypes).where(eq(schema.filamentTypes.id, id)).returning() }
  catch (error) { throw filamentTypeWriteError(error) }
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Jenis filament tidak ditemukan' })
  await logAudit(event, { action: 'delete', entity: 'filament_type', entityId: id, summary: `Hapus jenis filament "${row.name}"` })
  return { ok: true }
})
