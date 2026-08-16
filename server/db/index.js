import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

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
