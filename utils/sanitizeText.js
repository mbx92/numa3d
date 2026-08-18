/** Buang karakter yang sering tampil sebagai kotak / ￼ di mobile. */
export function sanitizeText(value) {
  if (value == null) return value
  return String(value)
    .replace(/\uFFFC/g, '') // object replacement
    .replace(/\uFFFD/g, '') // replacement character
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\u00B7/g, '-') // middle dot ·
    .replace(/\u2022/g, '-') // bullet •
    .replace(/\u2026/g, '...') // ellipsis …
    .replace(/[\u2012-\u2015]/g, '-') // dashes
    .replace(/\u00A0/g, ' ') // nbsp
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
