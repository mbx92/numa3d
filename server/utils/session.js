import crypto from 'node:crypto'

export const SESSION_COOKIE = 'numa3d_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 hari

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

export function timingSafeEquals(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

// Token stateless: "<userId>.<role>.<expiryMs>.<hmac(userId.role.expiryMs)>"
// Tidak ada session store di server — mengubah role/menghapus user tidak
// langsung mencabut token yang sudah terbit sampai kedaluwarsa (30 hari).
export function createSessionToken(secret, user) {
  const exp = String(Date.now() + SESSION_MAX_AGE * 1000)
  const payload = `${user.id}.${user.role}.${exp}`
  return `${payload}.${sign(payload, secret)}`
}

export function verifySessionToken(token, secret) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [id, role, exp, sig] = parts
  const payload = `${id}.${role}.${exp}`
  if (!timingSafeEquals(sig, sign(payload, secret))) return null
  if (Number(exp) <= Date.now()) return null
  return { id: Number(id), role }
}
