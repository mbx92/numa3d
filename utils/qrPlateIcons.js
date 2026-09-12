// Original geometric icons, shared by the UI, 3D model and SCAD export.
export const QR_PLATE_ICONS = [
  { id: 'none', label: 'Tanpa ikon' }, { id: 'wifi', label: 'Wi-Fi' },
  { id: 'whatsapp', label: 'WhatsApp', src: '/icons/whatsapp.png' }, { id: 'globe', label: 'Website' },
  { id: 'card', label: 'Pembayaran' }, { id: 'phone', label: 'Telepon' },
  { id: 'location', label: 'Lokasi' }, { id: 'heart', label: 'Sosial / suka' }, { id: 'link', label: 'Tautan' }
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
    case 'wifi': return { solid: [arc(17, 2.3, 42, 138, -8), arc(12.2, 2.3, 42, 138, -8), arc(7.4, 2.3, 42, 138, -8), circle(1.8, 0, -6)], holes: [] }
    case 'whatsapp': return {
      // Silhouette of the uploaded WhatsApp mark (public/icons/whatsapp.png).
      solid: [[
        [-0.411, 11], [1.027, 10.971], [2.317, 10.765], [3.755, 10.355], [5.016, 9.797],
        [6.189, 9.093], [7.333, 8.184], [8.272, 7.216], [8.976, 6.307], [9.563, 5.368],
        [10.267, 3.843], [10.677, 2.435], [10.883, 1.144], [10.912, -0.704], [10.824, -1.525],
        [10.531, -2.904], [9.944, -4.517], [8.683, -6.6], [7.128, -8.243], [5.368, -9.475],
        [3.52, -10.296], [1.261, -10.795], [-0.88, -10.824], [-1.995, -10.677], [-3.168, -10.384],
        [-5.192, -9.533], [-10.912, -11], [-9.475, -5.456], [-10.12, -4.048], [-10.56, -2.728],
        [-10.824, -1.437], [-10.912, -0.381], [-10.883, 1.027], [-10.677, 2.405], [-10.296, 3.755],
        [-9.856, 4.811], [-9.181, 6.013], [-8.155, 7.363], [-7.216, 8.301], [-6.013, 9.211],
        [-4.84, 9.885], [-3.491, 10.443], [-2.171, 10.795]
      ]],
      holes: [[
        [-0.469, 9.123], [-2.024, 8.917], [-3.197, 8.565], [-4.371, 8.037], [-5.309, 7.451],
        [-6.864, 6.043], [-7.715, 4.899], [-8.243, 3.931], [-8.741, 2.611], [-8.976, 1.613],
        [-9.093, 0.499], [-9.064, -0.851], [-8.859, -2.053], [-8.477, -3.285], [-7.509, -5.075],
        [-8.419, -8.389], [-4.987, -7.509], [-3.52, -8.301], [-2.405, -8.683], [-1.408, -8.888],
        [0.821, -8.947], [2.581, -8.595], [3.608, -8.213], [4.635, -7.685], [6.043, -6.629],
        [7.216, -5.339], [8.243, -3.579], [8.624, -2.552], [8.917, -1.232], [8.976, 0.968],
        [8.771, 2.229], [8.448, 3.285], [7.891, 4.488], [7.333, 5.368], [6.776, 6.072],
        [5.779, 7.04], [4.899, 7.685], [3.843, 8.272], [2.816, 8.683], [1.672, 8.976]
      ]],
      extra: [[
        [-3.872, 5.192], [-3.139, 5.192], [-2.816, 4.987], [-1.848, 2.816], [-1.848, 2.141],
        [-2.581, 1.232], [-2.699, 0.88], [-2.288, 0.147], [-1.672, -0.645], [-1.027, -1.291],
        [-0.235, -1.877], [1.232, -2.64], [1.525, -2.611], [2.669, -1.232], [3.139, -1.291],
        [5.427, -2.405], [5.515, -2.64], [5.456, -3.432], [5.309, -3.843], [4.869, -4.371],
        [4.312, -4.781], [3.52, -5.075], [2.552, -5.133], [1.76, -4.987], [0.381, -4.488],
        [-0.939, -3.755], [-2.317, -2.728], [-3.403, -1.672], [-4.312, -0.528], [-5.016, 0.557],
        [-5.397, 1.555], [-5.573, 2.552], [-5.427, 3.549], [-5.104, 4.253], [-4.459, 4.987]
      ]]
    }
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
