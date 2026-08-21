// Staff hanya boleh mencatat Pengeluaran, Penjualan, Produksi & Custom;
// sisanya (Material, Mesin, Packaging, Produk + file 3D, Galeri 3D, Pengaturan, User) khusus admin.
export function requireAdmin(event) {
  if (event.context.auth?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Aksi ini khusus admin' })
  }
}
