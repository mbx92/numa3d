import { useDb, schema } from '../../../../../db/index.js'
import { requireAdmin } from '../../../../../utils/rbac.js'
import { logAudit } from '../../../../../utils/audit.js'
import { setProductCover } from '../../../../../utils/productImages.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const imageId = Number(getRouterParam(event, 'imageId'))
  const db = useDb()
  const row = await setProductCover(db, schema, id, imageId)
  await logAudit(event, {
    action: 'update',
    entity: 'product',
    entityId: id,
    summary: `Set sampul produk id ${id} ke foto ${imageId}`
  })
  return row
})
