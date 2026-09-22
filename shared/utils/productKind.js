export const PRODUCT_KINDS = ['normal', 'custom', 'collection']

export const productKindLabel = {
  normal: 'Produk normal',
  custom: 'Custom',
  collection: 'Koleksi kita'
}

export const productKindBadge = {
  normal: 'bg-blue-100 text-blue-700',
  custom: 'bg-violet-100 text-violet-700',
  collection: 'bg-amber-100 text-amber-800'
}

export function normalizeProductKind(value, fallback = 'normal') {
  const kind = String(value || '')
  return PRODUCT_KINDS.includes(kind) ? kind : fallback
}
