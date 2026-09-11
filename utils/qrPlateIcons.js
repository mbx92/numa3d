// Original geometric icons, shared by the UI, 3D model and SCAD export.
export const QR_PLATE_ICONS = [
  { id: 'none', label: 'Tanpa ikon' }, { id: 'wifi', label: 'Wi-Fi' },
  { id: 'globe', label: 'Website' }, { id: 'card', label: 'Pembayaran' },
  { id: 'phone', label: 'Telepon' }, { id: 'location', label: 'Lokasi' },
  { id: 'heart', label: 'Sosial / suka' }, { id: 'link', label: 'Tautan' }
]

function rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] }
function circle(r, cx = 0, cy = 0, n = 48) {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos(i * 2 * Math.PI / n) * r, cy + Math.sin(i * 2 * Math.PI / n) * r])
}
function arc(r, thickness, from, to, cy = 0) {
  const points = []
  for (let i = 0; i <= 40; i++) {
    const a = (from + (to - from) * i / 40) * Math.PI / 180
    points.push([Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  for (let i = 40; i >= 0; i--) {
    const a = (from + (to - from) * i / 40) * Math.PI / 180
    points.push([Math.cos(a) * (r - thickness), cy + Math.sin(a) * (r - thickness)])
  }
  return points
}
export function qrIconContours(id) {
  switch (id) {
    case 'none': return { solid: [], holes: [] }
    case 'wifi': return { solid: [arc(17, 2.3, 42, 138, -8), arc(11.5, 2.3, 42, 138, -8), circle(1.8, 0, -6)], holes: [] }
    case 'globe': return {
      solid: [arc(10, 1.5, 0, 360), arc(10, 2.5, 0, 360).map(([x, y]) => [x * 0.45, y]), rect(-9, -0.8, 18, 1.6), rect(-8, 4, 16, 1.5), rect(-8, -5.5, 16, 1.5)], holes: []
    }
    case 'card': return { solid: [rect(-11, -7.5, 22, 15)], holes: [rect(-9.4, -5.9, 18.8, 6.8), rect(-9.4, 3.5, 18.8, 2.4)], extra: [rect(-7.5, -3.7, 5, 1.6)] }
    case 'phone': return { solid: [rect(-6, -10, 12, 20)], holes: [rect(-4.4, -6.2, 8.8, 13.5), circle(0.9, 0, -8)] }
    case 'location': return { solid: [circle(7, 0, 3), [[-6, -0.5], [0, -11], [6, -0.5]]], holes: [circle(2.5, 0, 3)] }
    case 'heart': return { solid: [Array.from({ length: 80 }, (_, i) => {
      const a = i * Math.PI * 2 / 80
      return [0.65 * 16 * Math.sin(a) ** 3, 0.65 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]
    })], holes: [] }
    case 'link': return { solid: [arc(6, 2, 35, 325).map(([x, y]) => [x - 5, y]), arc(6, 2, -145, 145).map(([x, y]) => [x + 5, y]), rect(-5, -1, 10, 2)], holes: [] }
    default: throw new Error('Ikon tidak dikenal')
  }
}

export function qrIconSvg(id) {
  const { solid, holes, extra = [] } = qrIconContours(id)
  const path = (rings) => rings.map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join('L')}Z`).join('')
  // A mask applies cutouts to the union, matching the solid geometry.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 28 28"><defs><mask id="cut"><rect x="-14" y="-14" width="28" height="28" fill="white"/><path d="${path(holes)}" fill="black"/></mask></defs><g fill="#475569"><path d="${path(solid)}" mask="url(#cut)"/><path d="${path(extra)}"/></g></svg>`
}
