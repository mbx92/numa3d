import { requireAdmin } from '../../utils/rbac.js'
import { readTuyaPlug } from '../../utils/tuyaLocal.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  return readTuyaPlug({
    ip: String(body.ip || body.tuyaIp || '').trim(),
    deviceId: String(body.deviceId || body.tuyaDeviceId || '').trim(),
    localKey: String(body.localKey || body.tuyaLocalKey || '').trim(),
    version: String(body.version || body.tuyaVersion || 'auto').trim() || 'auto'
  })
})
