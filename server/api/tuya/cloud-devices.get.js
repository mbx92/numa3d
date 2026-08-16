import { requireAdmin } from '../../utils/rbac.js'
import { fetchTuyaCloudDevices } from '../../utils/tuyaLocal.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const devices = await fetchTuyaCloudDevices()
  return (devices || []).map((d) => ({
    id: d.id,
    name: d.name,
    localKey: d.localKey,
    ip: d.ip,
    category: d.category
  }))
})
