import { desc, gte, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { getSettings } from '../../utils/settings.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const settings = await getSettings()
  const enabled = settings.slicerEnabled !== false
  const freshSince = new Date(Date.now() - 45_000)
  const [worker] = await db.select().from(schema.slicerWorkers)
    .where(gte(schema.slicerWorkers.lastSeenAt, freshSince))
    .orderBy(desc(schema.slicerWorkers.lastSeenAt)).limit(1)
  const [counts] = await db.select({
    queued: sql`count(*) filter (where ${schema.slicerJobs.status} = 'queued')::int`,
    processing: sql`count(*) filter (where ${schema.slicerJobs.status} = 'processing')::int`
  }).from(schema.slicerJobs)
  if (!worker) return {
    ready: false, enabled, serviceActive: false, status: 'offline',
    message: enabled ? 'Worker OrcaSlicer tidak aktif' : 'Worker OrcaSlicer dinonaktifkan',
    queued: counts.queued, processing: counts.processing
  }
  if (!enabled) return {
    ready: false, enabled, serviceActive: true, status: worker.status,
    message: worker.status === 'busy' ? 'Worker akan dijeda setelah job aktif selesai' : 'Worker OrcaSlicer dijeda',
    workerId: worker.id, lastSeenAt: worker.lastSeenAt,
    queued: counts.queued, processing: counts.processing
  }
  const ready = worker.status === 'ready' || worker.status === 'busy'
  return {
    ready, enabled, serviceActive: true, status: worker.status,
    message: ready ? `Worker OrcaSlicer aktif${worker.version ? ` · ${worker.version}` : ''}` : (worker.status === 'paused' ? 'Mengaktifkan worker OrcaSlicer…' : (worker.message || 'Worker OrcaSlicer tidak siap')),
    workerId: worker.id,
    lastSeenAt: worker.lastSeenAt,
    queued: counts.queued,
    processing: counts.processing
  }
})
