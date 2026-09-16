import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { filamentTypeWriteError } from '../../utils/filamentTypes.js'
import { normalizeFilamentTypeName } from '../../utils/filamentTypes.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'ID jenis filament tidak valid' })
  const body = await readBody(event)
  let name
  try { name = normalizeFilamentTypeName(body?.name) }
  catch (error) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  let row
  try { [row] = await useDb().update(schema.filamentTypes).set({ name }).where(eq(schema.filamentTypes.id, id)).returning() }
  catch (error) { throw filamentTypeWriteError(error) }
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Jenis filament tidak ditemukan' })
  await logAudit(event, { action: 'update', entity: 'filament_type', entityId: id, summary: `Ubah jenis filament "${name}"` })
  return row
})
