import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'
import { uploadImage } from '../../../utils/image.js'
import { listProductImages, syncProductCover } from '../../../utils/productImages.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const existing = await db.select().from(schema.products).where(eq(schema.products.id, id))
  if (!existing.length) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })

  const { objectKey } = await uploadImage(event, `products/${id}/images`)
  const rows = await db.transaction(async (tx) => {
    const gallery = await listProductImages(tx, schema, id)
    await tx.insert(schema.productImages).values({
      productId: id,
      objectKey,
      sortOrder: gallery.length
    })
    await syncProductCover(tx, schema, id)
    return tx.select().from(schema.products).where(eq(schema.products.id, id))
  })
  await logAudit(event, { action: 'update', entity: 'product', entityId: id, summary: `Tambah foto produk "${rows[0].name}"` })
  return rows[0]
})
