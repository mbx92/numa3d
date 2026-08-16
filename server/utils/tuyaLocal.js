import { spawn } from 'node:child_process'
import { join } from 'node:path'

const VERSIONS = ['3.4', '3.3', '3.5', '3.1']
const SCRIPT = join(process.cwd(), 'scripts/tinytuya_cli.py')

function num(dps, key) {
  const v = dps?.[String(key)]
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Plug Tuya pengukur daya: DP 1 on/off, 18 mA, 19 watt×10, 20 volt×10.
export function parsePlugDps(dps) {
  if (!dps || typeof dps !== 'object') return { on: null, powerWatt: null, voltage: null, currentMa: null, dps }
  const onVal = dps['1']
  const on = onVal === true || onVal === 1 || onVal === 'true'

  let powerRaw = num(dps, 19) ?? num(dps, 5) ?? num(dps, 21) ?? num(dps, 'cur_power')
  let voltageRaw = num(dps, 20) ?? num(dps, 6) ?? num(dps, 22) ?? num(dps, 'cur_voltage')
  let currentMa = num(dps, 18) ?? num(dps, 4) ?? num(dps, 23) ?? num(dps, 'cur_current')

  let powerWatt = powerRaw
  if (powerWatt != null) powerWatt = powerWatt / 10
  let voltage = voltageRaw
  if (voltage != null) voltage = voltageRaw / 10

  return {
    on,
    powerWatt: powerWatt == null ? null : Math.round(powerWatt * 10) / 10,
    voltage: voltage == null ? null : Math.round(voltage * 10) / 10,
    currentMa: currentMa == null ? null : Math.round(currentMa),
    dps
  }
}

export function publicMachine(row) {
  if (!row) return row
  const { tuyaLocalKey, ...rest } = row
  return {
    ...rest,
    tuyaConfigured: Boolean(row.tuyaIp && row.tuyaDeviceId && tuyaLocalKey)
  }
}

export function tuyaFieldsFromBody(body, existing) {
  const ip = String(body.tuyaIp || '').trim() || null
  const deviceId = String(body.tuyaDeviceId || '').trim() || null
  const incomingKey = String(body.tuyaLocalKey || '').trim()
  const clearing = body.tuyaClear && !ip && !deviceId && !incomingKey
  if (clearing) {
    return {
      tuyaIp: null,
      tuyaDeviceId: null,
      tuyaLocalKey: null,
      tuyaVersion: '3.4',
      tuyaLastError: null
    }
  }
  const key = incomingKey || existing?.tuyaLocalKey || null
  const version = String(body.tuyaVersion || existing?.tuyaVersion || '3.4').trim() || '3.4'
  return { tuyaIp: ip, tuyaDeviceId: deviceId, tuyaLocalKey: key, tuyaVersion: version }
}

function friendlyError(payload) {
  if (!payload) return 'TinyTuya gagal'
  if (payload.error === 'tinytuya_not_installed') {
    return 'Python TinyTuya belum terpasang. Jalankan: python3 -m pip install tinytuya'
  }
  if (payload.error === 'status_failed') {
    const d = payload.detail
    const msg = d?.Error || d?.Msg || JSON.stringify(d || {})
    return `Plug tidak merespons: ${msg}`
  }
  if (payload.error === 'cloud_failed') {
    const d = payload.detail
    return `Tuya Cloud: ${d?.Error || d?.Msg || JSON.stringify(d || {})}`
  }
  return String(payload.error || payload.message || 'TinyTuya gagal')
}

function runTinytuya(args, { timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [SCRIPT, ...args], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c) => {
      stdout += c
    })
    proc.stderr.on('data', (c) => {
      stderr += c
    })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(createError({ statusCode: 504, statusMessage: 'TinyTuya timeout' }))
    }, timeoutMs)
    proc.on('error', (e) => {
      clearTimeout(timer)
      if (e.code === 'ENOENT') {
        reject(createError({ statusCode: 500, statusMessage: 'python3 tidak ditemukan. Install Python 3 lalu: python3 -m pip install tinytuya' }))
        return
      }
      reject(createError({ statusCode: 500, statusMessage: e.message }))
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      let parsed = null
      try {
        parsed = stdout.trim() ? JSON.parse(stdout.trim().split('\n').pop()) : null
      } catch {
        parsed = null
      }
      if (code !== 0) {
        reject(
          createError({
            statusCode: 502,
            statusMessage: friendlyError(parsed) + (stderr && !parsed ? ` (${stderr.trim()})` : '')
          })
        )
        return
      }
      if (parsed?.error) {
        reject(createError({ statusCode: 502, statusMessage: friendlyError(parsed) }))
        return
      }
      resolve(parsed)
    })
  })
}

export async function checkTinytuya() {
  try {
    const r = await runTinytuya(['check'], { timeoutMs: 8000 })
    return { ok: true, tinytuya: r.tinytuya }
  } catch (e) {
    return { ok: false, error: e.statusMessage || e.message }
  }
}

export async function readTuyaPlug({ ip, deviceId, localKey, version }) {
  if (!ip || !deviceId || !localKey) {
    throw createError({ statusCode: 400, statusMessage: 'IP, Device ID, dan Local Key wajib diisi' })
  }
  const ver = version && version !== 'auto' ? version : 'auto'
  const out = await runTinytuya(
    ['status', '--id', deviceId, '--ip', ip, '--key', localKey, '--version', ver],
    { timeoutMs: 20000 }
  )
  return { ...parsePlugDps(out.dps), version: out.version, ip: out.ip || ip }
}

export async function scanTuyaLan() {
  const found = await runTinytuya(['scan', '--timeout', '8'], { timeoutMs: 20000 })
  return Array.isArray(found) ? found : []
}

export async function fetchTuyaCloudDevices() {
  const config = useRuntimeConfig()
  const apiKey = config.tuya?.apiKey || process.env.TUYA_API_KEY
  const apiSecret = config.tuya?.apiSecret || process.env.TUYA_API_SECRET
  const region = config.tuya?.apiRegion || process.env.TUYA_API_REGION || 'in'
  if (!apiKey || !apiSecret) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Isi TUYA_API_KEY dan TUYA_API_SECRET di .env (Access ID & Access Secret project IoT). Region default India (in); coba eu atau us jika daftar kosong.'
    })
  }
  const args = ['cloud', '--api-key', apiKey, '--api-secret', apiSecret, '--region', region]
  return runTinytuya(args, { timeoutMs: 25000 })
}

export { VERSIONS }
