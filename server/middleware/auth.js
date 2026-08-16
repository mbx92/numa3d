import { verifySessionToken, SESSION_COOKIE } from '../utils/session.js'

// Semua endpoint /api/* wajib login, kecuali /api/auth/* (login/logout/me).
// event.context.auth = { id, role } dipakai handler untuk cek RBAC (lihat utils/rbac.js).
export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/') || path.startsWith('/api/auth/') || path.startsWith('/api/health')) return

  const config = useRuntimeConfig()
  const token = getCookie(event, SESSION_COOKIE)
  const auth = verifySessionToken(token, config.sessionSecret)
  if (!auth) {
    throw createError({ statusCode: 401, statusMessage: 'Belum login' })
  }
  event.context.auth = auth
})
