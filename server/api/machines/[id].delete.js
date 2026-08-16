import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.machines).where(eq(schema.machines.id, id))
  try {
    await db.delete(schema.machines).where(eq(schema.machines.id, id))
  } catch (e) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Mesin dipakai di recipe produk, tidak bisa dihapus'
    })
  }
  await logAudit(event, { action: 'delete', entity: 'machine', entityId: id, summary: `Hapus mesin "${existing[0]?.name || id}"` })
  return { ok: true }
})
