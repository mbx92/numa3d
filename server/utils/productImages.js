import { and, eq } from 'drizzle-orm'

export async function listProductImages(tx, schema, productId) {
  return tx
    .select()
    .from(schema.productImages)
    .where(eq(schema.productImages.productId, productId))
    .orderBy(schema.productImages.sortOrder, schema.productImages.id)
}

export async function syncProductCover(tx, schema, productId) {
  const imgs = await listProductImages(tx, schema, productId)
  const cover = imgs[0]?.objectKey || null
  await tx.update(schema.products).set({ imageKey: cover }).where(eq(schema.products.id, productId))
  return cover
}

export async function setProductCover(tx, schema, productId, imageId) {
  const imgs = await listProductImages(tx, schema, productId)
  const target = imgs.find((i) => i.id === imageId)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Gambar tidak ditemukan' })
  const rest = imgs.filter((i) => i.id !== imageId)
  const ordered = [target, ...rest]
  for (let i = 0; i < ordered.length; i++) {
    await tx
      .update(schema.productImages)
      .set({ sortOrder: i })
      .where(and(eq(schema.productImages.id, ordered[i].id), eq(schema.productImages.productId, productId)))
  }
  await tx.update(schema.products).set({ imageKey: target.objectKey }).where(eq(schema.products.id, productId))
  return target
}
