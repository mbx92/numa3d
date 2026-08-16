import { requireAdmin } from '../../utils/rbac.js'
import { scanTuyaLan } from '../../utils/tuyaLocal.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  try {
    return await scanTuyaLan()
  } catch (e) {
    throw createError({
      statusCode: 502,
      statusMessage: e.message || 'Gagal scan perangkat Tuya di LAN'
    })
  }
})
