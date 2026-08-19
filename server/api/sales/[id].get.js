import { getSettings } from '../../utils/settings.js'
import { ensureSaleInvoiceNumber, loadSaleInvoiceRow, toInvoicePayload } from '../../utils/invoice.js'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const payload = await db.transaction(async (tx) => {
    const row = await loadSaleInvoiceRow(tx, schema, id)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Penjualan tidak ditemukan' })
    const ensured = await ensureSaleInvoiceNumber(tx, schema, row)
    return { ...row, invoiceNumber: ensured.invoiceNumber }
  })
  const settings = await getSettings()
  return toInvoicePayload(payload, settings)
})
