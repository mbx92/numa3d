import { sql } from 'drizzle-orm'
import { useDb } from '../db/index.js'

export const healthEventHandler = defineEventHandler(async () => {
  try {
    await useDb().execute(sql`select 1`)
    return { ok: true }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Layanan tidak siap' })
  }
})
