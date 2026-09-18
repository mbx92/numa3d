import { access } from 'node:fs/promises'
import pg from 'pg'
import { resolveOrcaInstall } from '../server/utils/orcaSlicer.js'

const { executable } = resolveOrcaInstall()
if (!executable) {
  console.error('OrcaSlicer belum dikonfigurasi')
  process.exit(1)
}

try {
  await access(executable)
} catch {
  console.error('OrcaSlicer tidak ditemukan')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL wajib diisi')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2500 })
try {
  await pool.query('SELECT 1')
} catch {
  console.error('Database tidak siap')
  process.exit(1)
} finally {
  await pool.end()
}
