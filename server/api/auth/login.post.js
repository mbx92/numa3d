import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '../../utils/session.js'
import { checkLoginRateLimit, recordLoginFailure, clearLoginAttempts } from '../../utils/rateLimit.js'
import { useDb, schema } from '../../db/index.js'
import { logAuthEvent } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const username = body.username || ''

  const limit = checkLoginRateLimit(ip, username)
  if (limit.blocked) {
    await logAuthEvent({
      action: 'login_blocked',
      username,
      summary: `Login diblokir rate limit dari IP ${ip} (coba lagi ${Math.ceil(limit.retryAfterSec / 60)} menit)`
    })
    throw createError({
      statusCode: 429,
      statusMessage: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(limit.retryAfterSec / 60)} menit.`
    })
  }

  const db = useDb()
  const rows = await db.select().from(schema.users).where(eq(schema.users.username, username))
  const user = rows[0]
  const passwordOk = user ? await bcrypt.compare(body.password || '', user.passwordHash) : false
  if (!user || !passwordOk) {
    recordLoginFailure(ip, username)
    await logAuthEvent({ action: 'login_failed', username, summary: `Login gagal dari IP ${ip}` })
    throw createError({ statusCode: 401, statusMessage: 'Username atau password salah' })
  }
  clearLoginAttempts(ip, username)
  await logAuthEvent({ action: 'login', username: user.username, summary: `Login berhasil dari IP ${ip}` })

  setCookie(event, SESSION_COOKIE, createSessionToken(useRuntimeConfig().sessionSecret, user), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE
  })
  return { ok: true, user: { id: user.id, username: user.username, role: user.role } }
})
