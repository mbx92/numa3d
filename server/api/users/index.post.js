import bcrypt from 'bcryptjs'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body.username) throw createError({ statusCode: 400, statusMessage: 'Username wajib diisi' })
  if (!body.password || body.password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: 'Password minimal 6 karakter' })
  }
  if (!['admin', 'staff'].includes(body.role)) {
    throw createError({ statusCode: 400, statusMessage: 'Role tidak valid' })
  }

  const db = useDb()
  const passwordHash = await bcrypt.hash(body.password, 10)
  try {
    const rows = await db
      .insert(schema.users)
      .values({ username: body.username, passwordHash, role: body.role })
      .returning({ id: schema.users.id, username: schema.users.username, role: schema.users.role, createdAt: schema.users.createdAt })
    await logAudit(event, { action: 'create', entity: 'user', entityId: rows[0].id, summary: `Tambah user "${rows[0].username}" (role ${rows[0].role})` })
    return rows[0]
  } catch (e) {
    if (e.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Username sudah dipakai' })
    throw e
  }
})
