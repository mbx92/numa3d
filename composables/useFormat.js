const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function groupThousands(intStr) {
  return String(intStr).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Format angka IDR tanpa bergantung ke locale OS (hindari separator aneh). */
export function formatIDR(value) {
  const n = Math.round(Number(value) || 0)
  const sign = n < 0 ? '-' : ''
  return 'Rp ' + sign + groupThousands(Math.abs(n))
}

export function formatNumber(value, digits = 0) {
  const n = Number(value) || 0
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (!digits) return sign + groupThousands(Math.round(abs))
  const fixed = abs.toFixed(digits)
  const [intPart, decPart] = fixed.split('.')
  return sign + groupThousands(intPart) + ',' + decPart
}

export function formatDate(value) {
  if (!value) return '-'
  const raw = String(value)
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  let y
  let mo
  let d
  if (m) {
    y = Number(m[1])
    mo = Number(m[2])
    d = Number(m[3])
  } else {
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return '-'
    y = dt.getFullYear()
    mo = dt.getMonth() + 1
    d = dt.getDate()
  }
  const dd = String(d).padStart(2, '0')
  return `${dd} ${MONTHS_ID[mo - 1] || mo} ${y}`
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
