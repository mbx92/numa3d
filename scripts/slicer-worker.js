import pg from 'pg'
import { Client } from 'minio'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { sliceGenerator3mf, orcaSlicerStatus } from '../server/utils/orcaSlicer.js'
import { resolveMinioConfig } from '../server/utils/minio.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL wajib diisi pada slicer worker')

const workerId = process.env.SLICER_WORKER_ID || `${hostname()}-${randomUUID().slice(0, 8)}`
const pollMs = Math.max(Number(process.env.SLICER_POLL_MS) || 2000, 500)
const maxBytes = 40 * 1024 * 1024
const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 })
const minioConfig = resolveMinioConfig({
  endPoint: process.env.MINIO_ENDPOINT,
  port: process.env.MINIO_PORT,
  useSSL: process.env.MINIO_USE_SSL,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
  bucket: process.env.MINIO_BUCKET
})
const minio = new Client({
  endPoint: minioConfig.endPoint,
  port: minioConfig.port,
  useSSL: minioConfig.useSSL,
  accessKey: minioConfig.accessKey,
  secretKey: minioConfig.secretKey
})
let stopping = false
let activeController = null

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function register(status, message = null, currentJobId = null) {
  await pool.query(`
    INSERT INTO slicer_workers (id, status, version, current_job_id, message, started_at, last_seen_at)
    VALUES ($1, $2, $3, $4, $5, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      status = excluded.status,
      version = excluded.version,
      current_job_id = excluded.current_job_id,
      message = excluded.message,
      last_seen_at = now()
  `, [workerId, status, process.env.ORCA_VERSION || null, currentJobId, message])
}

async function recoverStaleJobs() {
  await pool.query(`
    UPDATE slicer_jobs SET status = 'queued', worker_id = null, progress = 0,
      stage = 'Worker terputus, menunggu worker lain', started_at = null, heartbeat_at = null
    WHERE status = 'processing' AND heartbeat_at < now() - interval '5 minutes'
      AND attempts < max_attempts
  `)
  await pool.query(`
    UPDATE slicer_jobs SET status = 'failed', progress = 0, stage = 'Gagal',
      error = coalesce(error, 'Worker terputus dan batas percobaan tercapai'), finished_at = now()
    WHERE status = 'processing' AND heartbeat_at < now() - interval '5 minutes'
      AND attempts >= max_attempts
  `)
}

async function claimJob() {
  const { rows } = await pool.query(`
    WITH next_job AS (
      SELECT id FROM slicer_jobs
      WHERE status = 'queued' AND cancel_requested = false
      ORDER BY created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE slicer_jobs AS job SET
      status = 'processing', worker_id = $1, attempts = attempts + 1,
      progress = 5, stage = 'Mengunduh model', started_at = now(),
      finished_at = null, heartbeat_at = now(), error = null
    FROM next_job WHERE job.id = next_job.id
    RETURNING job.*
  `, [workerId])
  return rows[0] || null
}

async function readObject(objectKey) {
  const stream = await minio.getObject(minioConfig.bucket, objectKey)
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > maxBytes) {
      stream.destroy()
      throw new Error('File antrean melebihi batas 40 MB')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}

async function updateJob(id, fields) {
  const entries = Object.entries(fields)
  const values = entries.map(([, value]) => value)
  const sets = entries.map(([key], index) => `${key} = $${index + 2}`)
  await pool.query(`UPDATE slicer_jobs SET ${sets.join(', ')}, heartbeat_at = now() WHERE id = $1`, [id, ...values])
}

async function processJob(job) {
  const controller = new AbortController()
  activeController = controller
  const heartbeat = setInterval(async () => {
    try {
      const { rows } = await pool.query('UPDATE slicer_jobs SET heartbeat_at = now() WHERE id = $1 RETURNING cancel_requested', [job.id])
      await register('busy', null, job.id)
      if (rows[0]?.cancel_requested) controller.abort()
    } catch (error) {
      console.error('[slicer-worker] heartbeat gagal:', error.message)
    }
  }, 5000)
  try {
    const bytes = await readObject(job.object_key)
    await updateJob(job.id, { progress: 20, stage: 'OrcaSlicer sedang memproses' })
    const result = await sliceGenerator3mf(bytes, {
      tool: job.tool,
      includeProfile: job.include_profile,
      inputConfig: job.input_config,
      signal: controller.signal
    })
    const { rows } = await pool.query('SELECT cancel_requested FROM slicer_jobs WHERE id = $1', [job.id])
    if (rows[0]?.cancel_requested) {
      await updateJob(job.id, { status: 'cancelled', progress: 0, stage: 'Dibatalkan', finished_at: new Date() })
    } else {
      await updateJob(job.id, {
        status: 'completed', progress: 100, stage: 'Selesai', result: JSON.stringify(result), error: null, finished_at: new Date()
      })
    }
  } catch (error) {
    const { rows } = await pool.query('SELECT cancel_requested FROM slicer_jobs WHERE id = $1', [job.id])
    const cancelled = rows[0]?.cancel_requested === true
    if (stopping && !cancelled) {
      await pool.query(`
        UPDATE slicer_jobs SET status = 'queued', worker_id = null, progress = 0,
          stage = 'Worker berhenti, menunggu worker aktif', error = null,
          cancel_requested = false, started_at = null, finished_at = null, heartbeat_at = null
        WHERE id = $1
      `, [job.id])
    } else {
      await updateJob(job.id, {
        status: cancelled ? 'cancelled' : 'failed',
        progress: 0,
        stage: cancelled ? 'Dibatalkan' : 'Gagal',
        error: cancelled ? null : String(error.message || error).slice(0, 4000),
        finished_at: new Date()
      })
      if (!cancelled) console.error(`[slicer-worker] job #${job.id} gagal:`, error)
    }
  } finally {
    clearInterval(heartbeat)
    activeController = null
    await register(stopping ? 'stopping' : 'ready')
  }
}

async function shutdown(signal) {
  if (stopping) return
  stopping = true
  console.log(`[slicer-worker] menerima ${signal}, menghentikan worker...`)
  activeController?.abort()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

try {
  const status = await orcaSlicerStatus()
  if (!status.ready) throw new Error(status.message)
  await recoverStaleJobs()
  await register('ready')
  console.log(`[slicer-worker] ${workerId} siap`)
  while (!stopping) {
    const job = await claimJob()
    if (job) await processJob(job)
    else {
      await register('ready')
      await wait(pollMs)
    }
  }
  await register('offline', 'Worker dihentikan')
} catch (error) {
  console.error('[slicer-worker] berhenti:', error)
  await register('error', String(error.message || error).slice(0, 1000)).catch(() => {})
  process.exitCode = 1
} finally {
  await pool.end()
}
