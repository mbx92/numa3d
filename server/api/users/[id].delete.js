import { eq, and, ne, count } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (id === event.context.auth.id) {
    throw createError({ statusCode: 400, statusMessage: 'Tidak bisa menghapus akun sendiri' })
  }

  const db = useDb()
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id))
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'User tidak ditemukan' })

  if (rows[0].role === 'admin') {
    const [{ value }] = await db
      .select({ value: count() })
      .from(schema.users)
      .where(and(eq(schema.users.role, 'admin'), ne(schema.users.id, id)))
    if (Number(value) === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Minimal harus ada 1 admin' })
    }
  }

  await db.delete(schema.users).where(eq(schema.users.id, id))
  await logAudit(event, { action: 'delete', entity: 'user', entityId: id, summary: `Hapus user "${rows[0].username}"` })
  return { ok: true }
})
