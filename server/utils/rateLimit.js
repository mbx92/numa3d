// Rate limit login sederhana in-memory (cukup untuk skala aplikasi single-instance ini).
// Dua lapis: per-IP (cegah iterasi banyak username dari satu sumber) dan
// per-IP+username (cegah credential stuffing ke satu akun).
const WINDOW_MS = 15 * 60 * 1000
const IP_MAX_ATTEMPTS = 20
const IP_USER_MAX_ATTEMPTS = 5

const attempts = new Map() // key -> { count, firstAttempt }

function check(key, max) {
  const entry = attempts.get(key)
  if (!entry || Date.now() - entry.firstAttempt > WINDOW_MS) return { blocked: false }
  if (entry.count >= max) {
    return { blocked: true, retryAfterSec: Math.ceil((WINDOW_MS - (Date.now() - entry.firstAttempt)) / 1000) }
  }
  return { blocked: false }
}

function bump(key) {
  const entry = attempts.get(key)
  if (!entry || Date.now() - entry.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: Date.now() })
  } else {
    entry.count += 1
  }
}

export function checkLoginRateLimit(ip, username) {
  const byIp = check(`ip:${ip}`, IP_MAX_ATTEMPTS)
  if (byIp.blocked) return byIp
  return check(`ipuser:${ip}:${username}`, IP_USER_MAX_ATTEMPTS)
}

export function recordLoginFailure(ip, username) {
  bump(`ip:${ip}`)
  bump(`ipuser:${ip}:${username}`)
}

export function clearLoginAttempts(ip, username) {
  attempts.delete(`ipuser:${ip}:${username}`)
}
