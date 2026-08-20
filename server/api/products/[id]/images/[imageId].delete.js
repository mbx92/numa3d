import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'
import { requireAdmin } from '../../../../utils/rbac.js'
import { logAudit } from '../../../../utils/audit.js'
import { removeImageQuietly } from '../../../../utils/image.js'
import { syncProductCover } from '../../../../utils/productImages.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const imageId = Number(getRouterParam(event, 'imageId'))
  const db = useDb()
  const [row] = await db
    .select()
    .from(schema.productImages)
    .where(and(eq(schema.productImages.id, imageId), eq(schema.productImages.productId, id)))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Gambar tidak ada' })
  await db.delete(schema.productImages).where(eq(schema.productImages.id, imageId))
  await removeImageQuietly(row.objectKey)
  await syncProductCover(db, schema, id)
  await logAudit(event, {
    action: 'update',
    entity: 'product',
    entityId: id,
    summary: `Hapus foto galeri produk id ${id}`
  })
  return { ok: true }
})
