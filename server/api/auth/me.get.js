import { eq } from 'drizzle-orm'
import { verifySessionToken, SESSION_COOKIE } from '../../utils/session.js'
import { useDb, schema } from '../../db/index.js'

// Dipanggil oleh middleware/auth.global.js di tiap navigasi halaman.
// Selain verifikasi token, cek ulang ke DB agar role yang ditampilkan
// selalu terkini dan user yang sudah dihapus langsung ter-logout.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const token = getCookie(event, SESSION_COOKIE)
  const auth = verifySessionToken(token, config.sessionSecret)
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Belum login' })

  const db = useDb()
  const rows = await db
    .select({ id: schema.users.id, username: schema.users.username, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, auth.id))
  if (!rows.length) throw createError({ statusCode: 401, statusMessage: 'Belum login' })
  return rows[0]
})
