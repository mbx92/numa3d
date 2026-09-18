import { useDb, schema } from '../../../db/index.js'
import { logAudit } from '../../../utils/audit.js'
import { queueOrderProduction } from '../../../utils/orders.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const result = await useDb().transaction((tx) => queueOrderProduction(tx, schema, id, { reserveStock: true }))
  await logAudit(event, {
    action: 'update',
    entity: 'order',
    entityId: id,
    summary: result.production
      ? `Konfirmasi order #${id}, antrekan ${result.shortage} unit produksi`
      : `Konfirmasi order #${id}, stok tersedia sudah direservasi`
  })
  return result
})
