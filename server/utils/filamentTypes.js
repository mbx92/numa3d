import { eq } from 'drizzle-orm'
import { schema } from '../db/index.js'

export function normalizeFilamentTypeName(value) {
  if (typeof value !== 'string') throw new Error('Nama jenis filament wajib diisi')
  const name = value.replace(/\s+/g, ' ').trim()
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Nama jenis filament harus 1–60 karakter')
  return name
}

export async function resolveFilamentTypeId(db, materialType, value) {
  if (materialType !== 'filament' || value == null || value === '') return null
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw createError({ statusCode: 400, statusMessage: 'Jenis filament tidak valid' })
  const [found] = await db.select({ id: schema.filamentTypes.id }).from(schema.filamentTypes).where(eq(schema.filamentTypes.id, id)).limit(1)
  if (!found) throw createError({ statusCode: 400, statusMessage: 'Jenis filament tidak ditemukan' })
  return id
}

export function filamentTypeWriteError(error) {
  const code = error.code || error.cause?.code
  if (code === '23505') return createError({ statusCode: 409, statusMessage: 'Nama jenis filament sudah ada' })
  if (code === '23503') return createError({ statusCode: 409, statusMessage: 'Jenis filament masih digunakan oleh material' })
  return error
}
