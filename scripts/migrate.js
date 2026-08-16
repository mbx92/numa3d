import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL wajib diisi')
  process.exit(1)
}

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../server/db/migrations')
const pool = new pg.Pool({ connectionString: url })
const db = drizzle(pool)

try {
  await migrate(db, { migrationsFolder })
  console.log('[numa3d] Migrasi database selesai')
} finally {
  await pool.end()
}
