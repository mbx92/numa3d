import { desc } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { requireAdmin } from '../utils/rbac.js'

// 200 entri terbaru cukup untuk skala aplikasi ini — tidak perlu paginasi.
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const db = useDb()
  return db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(200)
})
