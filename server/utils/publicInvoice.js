import { and, eq, gt } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { getSettings } from './settings.js'
import { loadSaleInvoiceRow, toInvoicePayload } from './invoice.js'

export async function loadPublicInvoice(token) {
  const raw = String(token || '').trim()
  if (!raw) throw createError({ statusCode: 404, statusMessage: 'Tautan tidak valid' })
  const db = useDb()
  const [link] = await db
    .select()
    .from(schema.invoiceShareLinks)
    .where(and(eq(schema.invoiceShareLinks.token, raw), gt(schema.invoiceShareLinks.expiresAt, new Date())))
    .limit(1)
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Tautan tidak valid atau sudah kedaluwarsa' })
  const row = await loadSaleInvoiceRow(db, schema, link.saleId)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Invoice tidak ditemukan' })
  const settings = await getSettings()
  return { invoice: toInvoicePayload(row, settings), expiresAt: link.expiresAt }
}
