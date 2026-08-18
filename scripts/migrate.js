import pg from 'pg'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Migrator sendiri (bukan drizzle migrate default): tiap file migrasi di-commit
// terpisah. Default drizzle membungkus SEMUA migrasi pending dalam 1 transaksi,
// sehingga `ALTER TYPE ... ADD VALUE` + pemakaian nilai baru (SET DEFAULT) gagal
// dengan "unsafe use of new value".

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL wajib diisi')
  process.exit(1)
}

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../server/db/migrations')
const journalPath = join(migrationsFolder, 'meta/_journal.json')
if (!existsSync(journalPath)) {
  console.error('Tidak menemukan meta/_journal.json')
  process.exit(1)
}

const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
const pool = new pg.Pool({ connectionString: url })
const client = await pool.connect()

try {
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle')
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)

  const { rows } = await client.query(
    'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1'
  )
  const last = rows[0]

  for (const entry of journal.entries) {
    if (last && Number(last.created_at) >= entry.when) continue

    const migrationPath = join(migrationsFolder, `${entry.tag}.sql`)
    if (!existsSync(migrationPath)) {
      throw new Error(`File migrasi tidak ada: ${migrationPath}`)
    }

    const query = readFileSync(migrationPath, 'utf8')
    const statements = query
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    const hash = createHash('sha256').update(query).digest('hex')

    console.log(`[numa3d] Migrasi ${entry.tag}…`)
    await client.query('BEGIN')
    try {
      for (const stmt of statements) {
        await client.query(stmt)
      }
      await client.query(
        'INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)',
        [hash, entry.when]
      )
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  }

  console.log('[numa3d] Migrasi database selesai')
} catch (e) {
  console.error('[numa3d] Migrasi gagal:', e.message || e)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
