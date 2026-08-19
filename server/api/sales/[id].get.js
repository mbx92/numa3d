import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { getSettings } from '../../utils/settings.js'
import { ensureSaleInvoiceNumber } from '../../utils/invoice.js'

const channelLabel = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok_shop: 'TikTok Shop',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  direct: 'Langsung',
  other: 'Lainnya'
}

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const payload = await db.transaction(async (tx) => {
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
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Penjualan tidak ditemukan' })
    const ensured = await ensureSaleInvoiceNumber(tx, schema, row)
    return { ...row, invoiceNumber: ensured.invoiceNumber }
  })

  const settings = await getSettings()
  const qty = payload.quantity
  const unitPrice = payload.salePricePerUnit
  const amount = qty * unitPrice
  const itemName = payload.customOrderId
    ? `Custom — ${payload.customTitle || 'desain pelanggan'}`
    : payload.productName || 'Produk'
  const customerName = payload.customerName || payload.customCustomerName || '—'

  return {
    id: payload.id,
    invoiceNumber: payload.invoiceNumber,
    date: payload.date,
    customerName,
    channel: payload.channel,
    channelLabel: channelLabel[payload.channel] || payload.channel,
    notes: payload.notes,
    isCustom: !!payload.customOrderId,
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
})
