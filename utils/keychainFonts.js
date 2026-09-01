/** Label tampilan dari nama file font di public/fonts/. */
export function formatFontFilename(filename) {
  const base = String(filename || '')
    .replace(/\.(ttf|otf|woff2?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  if (!base) return 'Font'
  return base.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function fontOptionLabel(font) {
  if (!font) return ''
  return font.label || formatFontFilename(font.filename)
}
