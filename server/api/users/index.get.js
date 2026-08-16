import { desc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const db = useDb()
  return db
    .select({ id: schema.users.id, username: schema.users.username, role: schema.users.role, createdAt: schema.users.createdAt })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
})
