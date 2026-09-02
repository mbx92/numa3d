export const DEFAULT_MATERIAL_COLOR = '#9ca3af'

/** Normalisasi input hex (#RGB atau #RRGGBB) ke lowercase #rrggbb. */
export function parseMaterialColor(value, fallback = DEFAULT_MATERIAL_COLOR) {
  const s = String(value ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const h = s.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return fallback ?? null
}
