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
