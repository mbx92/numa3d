import { useDb, schema } from '../../../db/index.js'
import { logAudit } from '../../../utils/audit.js'
import { queueOrderProduction } from '../../../utils/orders.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const result = await useDb().transaction((tx) => queueOrderProduction(tx, schema, id))
  if (!result.production) {
    throw createError({ statusCode: 400, statusMessage: 'Tidak ada kekurangan unit yang perlu diproduksi' })
  }
  await logAudit(event, {
    action: 'create',
    entity: 'production',
    entityId: result.production.id,
    summary: `Produksi ${result.shortage} unit untuk order #${id}`
  })
  return result
})
