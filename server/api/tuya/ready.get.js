import { requireAdmin } from '../../utils/rbac.js'
import { checkTinytuya } from '../../utils/tuyaLocal.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const config = useRuntimeConfig()
  const ready = await checkTinytuya()
  return {
    ...ready,
    cloudConfigured: Boolean(config.tuya?.apiKey && config.tuya?.apiSecret),
    region: config.tuya?.apiRegion || 'in'
  }
})
