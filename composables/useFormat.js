export function formatIDR(value) {
  const n = Math.round(Number(value) || 0)
  return 'Rp ' + n.toLocaleString('id-ID')
}

export function formatNumber(value, digits = 0) {
  return (Number(value) || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  })
}

export function formatDate(value) {
  if (!value) return '-'
  // Hindari geser hari: 'YYYY-MM-DD' / ISO date-only diparse sebagai tanggal kalender lokal.
  const raw = String(value)
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Pakai komponen tanggal lokal, bukan toISOString() yang berbasis UTC —
// di WIB/WITA/WIT, UTC masih menunjuk tanggal kemarin sampai pagi hari.
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthStartStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
