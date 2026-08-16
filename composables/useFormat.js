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
  const d = new Date(value)
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
