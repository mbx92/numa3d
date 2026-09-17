import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { filamentTypeWriteError } from '../../utils/filamentTypes.js'
import { normalizeFilamentTypeName } from '../../utils/filamentTypes.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  let name
  try { name = normalizeFilamentTypeName(body?.name) }
  catch (error) { throw createError({ statusCode: 400, statusMessage: error.message }) }
  let row
  try { [row] = await useDb().insert(schema.filamentTypes).values({ name }).returning() }
  catch (error) { throw filamentTypeWriteError(error) }
  await logAudit(event, { action: 'create', entity: 'filament_type', entityId: row.id, summary: `Tambah jenis filament "${name}"` })
  return row
})
