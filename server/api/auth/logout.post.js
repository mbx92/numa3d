import { SESSION_COOKIE } from '../../utils/session.js'

export default defineEventHandler((event) => {
  deleteCookie(event, SESSION_COOKIE, { path: '/', sameSite: 'lax' })
  return { ok: true }
})
