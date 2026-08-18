// Tanggal harus dihitung di zona waktu lokal server, bukan UTC.
// `toISOString().slice(0,10)` salah untuk WIB/WITA/WIT: sebelum pukul 07–09 pagi
// nilainya masih tanggal kemarin, sehingga filter "hari ini"/"bulan ini" meleset.
export function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthStartStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Normalisasi nilai DATE dari pg/Drizzle/query string → 'YYYY-MM-DD' atau null. */
export function toDateStr(value) {
  if (value == null || value === '') return null
  if (Array.isArray(value)) return toDateStr(value[0])
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Kunci bulan 'YYYY-MM' dari DATE string/Date. */
export function monthKey(value) {
  const s = toDateStr(value)
  return s ? s.slice(0, 7) : null
}
