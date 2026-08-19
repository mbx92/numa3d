import { eq, sql } from 'drizzle-orm'

function yyyymmFromDate(dateStr) {
  const raw = String(dateStr || '').slice(0, 10).replace(/-/g, '')
  if (raw.length >= 6) return raw.slice(0, 6)
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function allocateInvoiceNumber(tx, schema, dateStr) {
  const prefix = `INV-${yyyymmFromDate(dateStr)}-`
  const rows = await tx
    .select({ invoiceNumber: schema.sales.invoiceNumber })
    .from(schema.sales)
    .where(sql`${schema.sales.invoiceNumber} like ${prefix + '%'}`)
  let max = 0
  for (const r of rows) {
    const n = Number(String(r.invoiceNumber || '').slice(prefix.length))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function ensureSaleInvoiceNumber(tx, schema, sale) {
  if (sale?.invoiceNumber) return sale
  const invoiceNumber = await allocateInvoiceNumber(tx, schema, sale.date)
  const [updated] = await tx
    .update(schema.sales)
    .set({ invoiceNumber })
    .where(eq(schema.sales.id, sale.id))
    .returning()
  return updated || { ...sale, invoiceNumber }
}
