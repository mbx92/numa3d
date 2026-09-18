import { desc, gte, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const freshSince = new Date(Date.now() - 45_000)
  const [worker] = await db.select().from(schema.slicerWorkers)
    .where(gte(schema.slicerWorkers.lastSeenAt, freshSince))
    .orderBy(desc(schema.slicerWorkers.lastSeenAt)).limit(1)
  const [counts] = await db.select({
    queued: sql`count(*) filter (where ${schema.slicerJobs.status} = 'queued')::int`,
    processing: sql`count(*) filter (where ${schema.slicerJobs.status} = 'processing')::int`
  }).from(schema.slicerJobs)
  if (!worker) return { ready: false, message: 'Worker OrcaSlicer tidak aktif', queued: counts.queued, processing: counts.processing }
  const ready = worker.status === 'ready' || worker.status === 'busy'
  return {
    ready,
    message: ready ? `Worker OrcaSlicer aktif${worker.version ? ` · ${worker.version}` : ''}` : (worker.message || 'Worker OrcaSlicer tidak siap'),
    workerId: worker.id,
    lastSeenAt: worker.lastSeenAt,
    queued: counts.queued,
    processing: counts.processing
  }
})
