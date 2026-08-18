import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

// node-postgres default: kolom DATE → JS Date (UTC midnight). String(date).slice(0,7)
// jadi "Wed Aug" bukan "2026-08", dan JSON/ISO bisa geser hari di zona non-UTC.
// Paksa tetap 'YYYY-MM-DD' agar filter laporan & bucket bulanan konsisten.
pg.types.setTypeParser(pg.types.builtins.DATE, (val) => val)

let _db = null

export function useDb() {
  if (!_db) {
    const config = useRuntimeConfig()
    const pool = new pg.Pool({ connectionString: config.databaseUrl })
    _db = drizzle(pool, { schema })
  }
  return _db
}

export { schema }
