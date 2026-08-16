import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.packaging).where(eq(schema.packaging.id, id))
  try {
    await db.delete(schema.packaging).where(eq(schema.packaging.id, id))
  } catch (e) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Packaging dipakai di produk, tidak bisa dihapus'
    })
  }
  await logAudit(event, { action: 'delete', entity: 'packaging', entityId: id, summary: `Hapus packaging "${existing[0]?.name || id}"` })
  return { ok: true }
})
