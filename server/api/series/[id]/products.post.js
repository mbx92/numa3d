import { eq, inArray } from 'drizzle-orm'
import { useDb, schema } from '../../../db/index.js'
import { requireAdmin } from '../../../utils/rbac.js'
import { logAudit } from '../../../utils/audit.js'

// Tambahkan satu atau lebih produk ke series ini. Produk yang sudah
// berada di series lain akan dipindahkan (satu produk = satu series).
export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const ids = (Array.isArray(body.productIds) ? body.productIds : [body.productId])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'Pilih minimal satu produk' })

  const db = useDb()
  const seriesRows = await db.select({ id: schema.productSeries.id, name: schema.productSeries.name }).from(schema.productSeries).where(eq(schema.productSeries.id, id))
  if (!seriesRows.length) throw createError({ statusCode: 404, statusMessage: 'Series tidak ditemukan' })

  const updated = await db
    .update(schema.products)
    .set({ seriesId: id })
    .where(inArray(schema.products.id, ids))
    .returning({ id: schema.products.id, name: schema.products.name })

  if (!updated.length) throw createError({ statusCode: 404, statusMessage: 'Produk tidak ditemukan' })
  await logAudit(event, {
    action: 'update',
    entity: 'product_series',
    entityId: id,
    summary: `Tambah ${updated.length} produk ke series "${seriesRows[0].name}"`
  })
  return { ok: true, added: updated }
})
