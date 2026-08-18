// Staff hanya boleh mencatat Pengeluaran, Penjualan & Produksi; sisanya (Material,
// Mesin, Packaging, Produk + file 3D, Pengaturan, User) khusus admin.
export function requireAdmin(event) {
  if (event.context.auth?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Aksi ini khusus admin' })
  }
}
