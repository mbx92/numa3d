import { and, desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const conditions = []
  if (q.status) conditions.push(eq(schema.slicerJobs.status, q.status))
  if (q.mine === '1' || event.context.auth.role !== 'admin') conditions.push(eq(schema.slicerJobs.userId, event.context.auth.id))
  return useDb().select({
    id: schema.slicerJobs.id,
    userId: schema.slicerJobs.userId,
    username: schema.users.username,
    filename: schema.slicerJobs.filename,
    tool: schema.slicerJobs.tool,
    includeProfile: schema.slicerJobs.includeProfile,
    status: schema.slicerJobs.status,
    attempts: schema.slicerJobs.attempts,
    maxAttempts: schema.slicerJobs.maxAttempts,
    workerId: schema.slicerJobs.workerId,
    progress: schema.slicerJobs.progress,
    stage: schema.slicerJobs.stage,
    result: schema.slicerJobs.result,
    error: schema.slicerJobs.error,
    cancelRequested: schema.slicerJobs.cancelRequested,
    createdAt: schema.slicerJobs.createdAt,
    startedAt: schema.slicerJobs.startedAt,
    finishedAt: schema.slicerJobs.finishedAt,
    heartbeatAt: schema.slicerJobs.heartbeatAt
  }).from(schema.slicerJobs)
    .leftJoin(schema.users, eq(schema.slicerJobs.userId, schema.users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.slicerJobs.createdAt), desc(schema.slicerJobs.id))
    .limit(250)
})
