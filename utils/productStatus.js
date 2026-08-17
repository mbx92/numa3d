// Label & warna badge status produk — dipakai di daftar, detail, katalog.
export const PRODUCT_STATUSES = ['draft', 'rnd', 'active', 'discontinued']

export const productStatusLabel = {
  draft: 'Draft',
  rnd: 'R&D',
  active: 'Aktif',
  discontinued: 'Discontinued'
}

export const productStatusBadge = {
  draft: 'bg-amber-100 text-amber-800',
  rnd: 'bg-ink-200 text-ink-600',
  active: 'bg-green-100 text-green-700',
  discontinued: 'bg-ink-100 text-ink-400 line-through'
}

export function productStatusClass(status) {
  return productStatusBadge[status] || productStatusBadge.draft
}
