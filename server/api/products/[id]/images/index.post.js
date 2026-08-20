import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../db/index.js'
import { requireAdmin } from '../../../../utils/rbac.js'
import { logAudit } from '../../../../utils/audit.js'
import { uploadImages } from '../../../../utils/image.js'
import { listProductImages, syncProductCover } from '../../../../utils/productImages.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const [product] = await db.select().from(schema.products).where(eq(schema.products.id, id))
  if (!product) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })

  const uploaded = await uploadImages(event, `products/${id}/images`)
  const rows = await db.transaction(async (tx) => {
    const existing = await listProductImages(tx, schema, id)
    const start = existing.length
    const created = []
    for (let i = 0; i < uploaded.length; i++) {
      const [row] = await tx
        .insert(schema.productImages)
        .values({
          productId: id,
          objectKey: uploaded[i].objectKey,
          sortOrder: start + i
        })
        .returning()
      created.push(row)
    }
    await syncProductCover(tx, schema, id)
    return created
  })
  await logAudit(event, {
    action: 'update',
    entity: 'product',
    entityId: id,
    summary: `Tambah ${rows.length} foto produk "${product.name}"`
  })
  return rows
})
