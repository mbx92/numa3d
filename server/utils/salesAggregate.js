import { and, gte, lte, eq } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { getHppForProducts } from './productHpp.js'

// Ambil baris penjualan pada rentang tanggal, sudah dilengkapi HPP saat ini
// dan turunannya (harga bersih setelah fee, revenue, margin).
// Catatan: HPP yang dipakai adalah HPP produk SAAT INI, bukan snapshot saat
// transaksi terjadi — mengubah harga material akan mengubah laporan historis.
export async function loadSalesWithHpp({ dateFrom, dateTo } = {}) {
  const db = useDb()
  const conds = []
  if (dateFrom) conds.push(gte(schema.sales.date, dateFrom))
  if (dateTo) conds.push(lte(schema.sales.date, dateTo))

  const rows = await db
    .select({
      id: schema.sales.id,
      date: schema.sales.date,
      productId: schema.sales.productId,
      productName: schema.products.name,
      quantity: schema.sales.quantity,
      salePricePerUnit: schema.sales.salePricePerUnit,
      channel: schema.sales.channel,
      marketplaceFeePercent: schema.sales.marketplaceFeePercent
    })
    .from(schema.sales)
    .leftJoin(schema.products, eq(schema.sales.productId, schema.products.id))
    .where(conds.length ? and(...conds) : undefined)

  const hppMap = await getHppForProducts([...new Set(rows.map((r) => r.productId))])

  return rows.map((r) => {
    const fee = r.marketplaceFeePercent || 0
    const netPricePerUnit = Math.round(r.salePricePerUnit * (1 - fee / 100))
    const hppPerUnit = hppMap.get(r.productId)?.total ?? 0
    const grossRevenue = r.salePricePerUnit * r.quantity
    const netRevenue = netPricePerUnit * r.quantity
    const totalHpp = hppPerUnit * r.quantity
    return {
      ...r,
      netPricePerUnit,
      hppPerUnit,
      grossRevenue,
      netRevenue,
      totalHpp,
      feeAmount: grossRevenue - netRevenue,
      netMargin: netRevenue - totalHpp
    }
  })
}

export function marginPercent(margin, revenue) {
  return revenue ? Math.round((margin / revenue) * 100) : 0
}
