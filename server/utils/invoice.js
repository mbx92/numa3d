import { randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'

const CHANNEL_LABEL = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok_shop: 'TikTok Shop',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  direct: 'Langsung',
  other: 'Lainnya'
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function yyyymmFromDate(dateStr) {
  const raw = String(dateStr || '').slice(0, 10).replace(/-/g, '')
  if (raw.length >= 6) return raw.slice(0, 6)
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatInvoiceIDR(value) {
  const n = Math.round(Number(value) || 0)
  const sign = n < 0 ? '-' : ''
  const grouped = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return 'Rp ' + sign + grouped
}

export function formatInvoiceDate(value) {
  if (!value) return '-'
  const raw = String(value)
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  let y
  let mo
  let d
  if (m) {
    y = Number(m[1])
    mo = Number(m[2])
    d = Number(m[3])
  } else {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return '-'
    y = dt.getFullYear()
    mo = dt.getMonth() + 1
    d = dt.getDate()
  }
  return `${String(d).padStart(2, '0')} ${MONTHS_ID[mo - 1] || mo} ${y}`
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

export async function loadSaleInvoiceRow(tx, schema, id) {
  const [row] = await tx
    .select({
      id: schema.sales.id,
      date: schema.sales.date,
      productId: schema.sales.productId,
      customOrderId: schema.sales.customOrderId,
      productName: schema.products.name,
      customTitle: schema.customOrders.title,
      customCustomerName: schema.customOrders.customerName,
      quantity: schema.sales.quantity,
      salePricePerUnit: schema.sales.salePricePerUnit,
      channel: schema.sales.channel,
      notes: schema.sales.notes,
      invoiceNumber: schema.sales.invoiceNumber,
      customerName: schema.sales.customerName
    })
    .from(schema.sales)
    .leftJoin(schema.products, eq(schema.sales.productId, schema.products.id))
    .leftJoin(schema.customOrders, eq(schema.sales.customOrderId, schema.customOrders.id))
    .where(eq(schema.sales.id, id))
  return row || null
}

export function toInvoicePayload(row, settings) {
  const qty = row.quantity
  const unitPrice = row.salePricePerUnit
  const amount = qty * unitPrice
  const itemName = row.customOrderId
    ? `Custom — ${row.customTitle || 'desain pelanggan'}`
    : row.productName || 'Produk'
  const customerName = row.customerName || row.customCustomerName || '—'
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    date: row.date,
    customerName,
    channel: row.channel,
    channelLabel: CHANNEL_LABEL[row.channel] || row.channel,
    notes: row.notes,
    isCustom: !!row.customOrderId,
    item: {
      name: itemName,
      quantity: qty,
      unitPrice,
      amount
    },
    subtotal: amount,
    total: amount,
    business: {
      name: settings.invoiceBusinessName || 'Numa3D',
      address: settings.invoiceAddress || null,
      phone: settings.invoicePhone || null,
      footer: settings.invoiceFooter || 'Terima kasih telah berbelanja.'
    }
  }
}

export function newShareToken() {
  return randomBytes(24).toString('base64url')
}

export function clampShareTtlDays(value) {
  const n = Math.round(Number(value) || 7)
  return Math.min(Math.max(n, 1), 365)
}
