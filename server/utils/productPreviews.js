import { and, desc, ilike, inArray, or } from 'drizzle-orm'
import { schema } from '../db/index.js'

export async function getProductPreviewMap(db, productIds) {
  if (!productIds.length) return new Map()
  const files = await db.select({
    id: schema.productFiles.id,
    productId: schema.productFiles.productId,
    filename: schema.productFiles.filename
  }).from(schema.productFiles)
    .where(and(
      inArray(schema.productFiles.productId, productIds),
      or(ilike(schema.productFiles.filename, '%.stl'), ilike(schema.productFiles.filename, '%.3mf'))
    ))
    .orderBy(desc(schema.productFiles.createdAt), desc(schema.productFiles.id))

  const previews = new Map()
  for (const file of files) {
    if (!previews.has(file.productId)) previews.set(file.productId, file)
  }
  return previews
}

export function withProductPreview(product, previews) {
  const preview = previews.get(product.id)
  return {
    ...product,
    previewFileId: preview?.id || null,
    previewFilename: preview?.filename || null
  }
}
