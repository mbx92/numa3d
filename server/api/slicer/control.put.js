import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { getSettings } from '../../utils/settings.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (typeof body?.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Status worker tidak valid' })
  }
  const current = await getSettings()
  const [settings] = await useDb().update(schema.appSettings)
    .set({ slicerEnabled: body.enabled })
    .where(eq(schema.appSettings.id, current.id))
    .returning({ enabled: schema.appSettings.slicerEnabled })
  await logAudit(event, {
    action: 'update', entity: 'slicer_worker', entityId: null,
    summary: body.enabled ? 'Aktifkan pemrosesan worker OrcaSlicer' : 'Jeda pemrosesan worker OrcaSlicer'
  })
  return settings
})
