/** PNG/JPG/WebP → SVG path vektor (silhouette atau layer warna). Tanpa raster tertanam. */

export const PNG_TO_SVG_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxEdge: 1024,
  defaultEdge: 512
}

const HEX = /^#([0-9a-f]{6})$/i

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function colorDist(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function fmt(n) {
  const v = Math.round(n * 100) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function isLight(rgb, cutoff = 240) {
  return rgb[0] >= cutoff && rgb[1] >= cutoff && rgb[2] >= cutoff
}

export function imageDataToBinaryMask(imageData, options = {}) {
  const width = imageData.width | 0
  const height = imageData.height | 0
  const data = imageData.data
  if (!width || !height || !data?.length) throw new Error('Gambar tidak valid')

  const threshold = clamp(Number(options.threshold ?? 128), 0, 255)
  const alphaCutoff = clamp(Number(options.alphaCutoff ?? 128), 0, 255)
  const invert = !!options.invert
  const detectMode = options.detectMode || 'auto'

  let transparent = 0
  const n = width * height
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) transparent++
  }
  const useAlpha =
    detectMode === 'alpha' || (detectMode === 'auto' && transparent > n * 0.02)

  const mask = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    const i = p * 4
    const a = data[i + 3]
    let on = 0
    if (useAlpha) {
      on = a >= alphaCutoff ? 1 : 0
    } else {
      if (a < alphaCutoff) on = 0
      else on = luma(data[i], data[i + 1], data[i + 2]) < threshold ? 1 : 0
    }
    mask[p] = invert ? 1 - on : on
  }
  return mask
}

export function despeckleMask(mask, width, height, minPixels = 0) {
  const w = width | 0
  const h = height | 0
  const min = Math.max(0, minPixels | 0)
  if (!min || min < 2) return mask
  const out = new Uint8Array(mask)
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)

  for (let start = 0; start < w * h; start++) {
    if (!out[start] || seen[start]) continue
    let top = 0
    stack[top++] = start
    seen[start] = 1
    const cells = [start]
    while (top) {
      const i = stack[--top]
      const x = i % w
      const y = (i / w) | 0
      const neigh = [x > 0 ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y > 0 ? i - w : -1, y + 1 < h ? i + w : -1]
      for (const j of neigh) {
        if (j < 0 || !out[j] || seen[j]) continue
        seen[j] = 1
        stack[top++] = j
        cells.push(j)
      }
    }
    if (cells.length < min) {
      for (const j of cells) out[j] = 0
    }
  }
  return out
}

function vertexKey(x, y) {
  return `${x},${y}`
}

function parseVertex(key) {
  const c = key.indexOf(',')
  return [Number(key.slice(0, c)), Number(key.slice(c + 1))]
}

/** Tepi piksel terisi → loop tertutup. Lubang ikut sebagai kontur terpisah. */
export function maskToContours(mask, width, height) {
  const w = width | 0
  const h = height | 0
  function filled(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0
    return mask[y * w + x] ? 1 : 0
  }

  const outgoing = new Map()
  function addEdge(x1, y1, x2, y2) {
    const a = vertexKey(x1, y1)
    const b = vertexKey(x2, y2)
    let list = outgoing.get(a)
    if (!list) {
      list = []
      outgoing.set(a, list)
    }
    list.push(b)
  }

  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) {
      const above = filled(x, y - 1)
      const below = filled(x, y)
      if (above === below) continue
      if (below) addEdge(x, y, x + 1, y)
      else addEdge(x + 1, y, x, y)
    }
  }
  for (let x = 0; x <= w; x++) {
    for (let y = 0; y < h; y++) {
      const left = filled(x - 1, y)
      const right = filled(x, y)
      if (left === right) continue
      if (right) addEdge(x, y + 1, x, y)
      else addEdge(x, y, x, y + 1)
    }
  }

  const used = new Set()
  const contours = []
  const limit = (w + h) * 8 + 16

  for (const [start, dests] of outgoing) {
    for (const first of dests) {
      const seed = `${start}>${first}`
      if (used.has(seed)) continue
      const loop = [parseVertex(start)]
      let curr = start
      let next = first
      let closed = false
      while (true) {
        used.add(`${curr}>${next}`)
        loop.push(parseVertex(next))
        if (next === start && loop.length > 2) {
          closed = true
          break
        }
        const opts = (outgoing.get(next) || []).filter((n) => !used.has(`${next}>${n}`))
        if (!opts.length) break
        curr = next
        next = opts[0]
        if (loop.length > limit) break
      }
      if (closed && loop.length >= 4) contours.push(loop)
    }
  }
  return contours
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  const x = a[0] + t * dx
  const y = a[1] + t * dy
  return Math.hypot(p[0] - x, p[1] - y)
}

export function simplifyPolyline(points, epsilon) {
  const eps = Number(epsilon)
  if (!Number.isFinite(eps) || eps <= 0 || points.length < 3) return points
  const first = points[0]
  const last = points[points.length - 1]
  let maxD = 0
  let idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last)
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > eps) {
    const left = simplifyPolyline(points.slice(0, idx + 1), eps)
    const right = simplifyPolyline(points.slice(idx), eps)
    return left.slice(0, -1).concat(right)
  }
  return [first, last]
}

export function simplifyClosedContour(points, epsilon) {
  if (points.length < 4) return points
  const ring = points.slice()
  const a = ring[0]
  const b = ring[ring.length - 1]
  if (a[0] === b[0] && a[1] === b[1]) ring.pop()
  if (ring.length < 3) return points
  const simplified = simplifyPolyline([...ring, ring[0]], epsilon)
  if (simplified.length < 4) return points
  return simplified
}

function contourArea(points) {
  let area = 0
  const n = points.length
  for (let i = 0; i < n - 1; i++) {
    area += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1]
  }
  return Math.abs(area) / 2
}

export function contoursToPathD(contours) {
  const parts = []
  for (const pts of contours) {
    if (!pts?.length) continue
    const start = pts[0]
    let d = `M${fmt(start[0])} ${fmt(start[1])}`
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]
      if (p[0] === pts[i - 1][0] && p[1] === pts[i - 1][1]) continue
      d += `L${fmt(p[0])} ${fmt(p[1])}`
    }
    d += 'Z'
    parts.push(d)
  }
  return parts.join('')
}

function maskToPathD(mask, width, height, simplify) {
  const raw = maskToContours(mask, width, height)
  const contours = []
  for (const loop of raw) {
    const simple = simplifyClosedContour(loop, simplify)
    if (simple.length < 4) continue
    if (contourArea(simple) < 0.5) continue
    contours.push(simple)
  }
  return { d: contoursToPathD(contours), pathCount: contours.length }
}

function quantizeColors(pixels, k) {
  const samples = []
  for (let i = 0; i < pixels.length; i += 8) {
    const p = pixels[i]
    if (p[3] < 128) continue
    samples.push([p[0], p[1], p[2]])
  }
  if (!samples.length) throw new Error('Gambar kosong atau transparan penuh')

  const count = Math.min(Math.max(k | 0, 2), 8)
  const centroids = []
  const step = Math.max(1, Math.floor(samples.length / count))
  for (let i = 0; i < count; i++) {
    centroids.push([...samples[Math.min(i * step, samples.length - 1)]])
  }

  for (let iter = 0; iter < 12; iter++) {
    const groups = Array.from({ length: count }, () => [])
    for (const s of samples) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < count; c++) {
        const d = colorDist(s, centroids[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      groups[best].push(s)
    }
    for (let c = 0; c < count; c++) {
      const g = groups[c]
      if (!g.length) continue
      const sum = [0, 0, 0]
      for (const p of g) {
        sum[0] += p[0]
        sum[1] += p[1]
        sum[2] += p[2]
      }
      centroids[c] = [
        Math.round(sum[0] / g.length),
        Math.round(sum[1] / g.length),
        Math.round(sum[2] / g.length)
      ]
    }
  }
  return centroids
}

function nearestCentroid(pixel, centroids) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < centroids.length; i++) {
    const d = colorDist(pixel, centroids[i])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function wrapSvg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`
}

function pathEl(d, fill) {
  const color = HEX.test(fill) ? fill.toLowerCase() : '#111827'
  return `<path fill="${color}" fill-rule="evenodd" d="${d}"/>`
}

function traceMaskLayer(mask, width, height, options) {
  const cleaned = despeckleMask(mask, width, height, options.despeckle || 0)
  return maskToPathD(cleaned, width, height, options.simplify ?? 1)
}

/**
 * Telusuri ImageData → SVG path (bukan <image>).
 * @returns {{ svg: string, width: number, height: number, pathCount: number, layers: Array<{color: string, pathCount: number}> }}
 */
export function rasterToSvg(imageData, options = {}) {
  const width = imageData.width | 0
  const height = imageData.height | 0
  if (!width || !height) throw new Error('Gambar tidak valid')

  const mode = options.mode === 'color' ? 'color' : 'silhouette'
  const simplify = clamp(Number(options.simplify ?? 1), 0, 8)
  const despeckle = clamp(Number(options.despeckle ?? 8), 0, 400)
  const fill = typeof options.fill === 'string' && HEX.test(options.fill) ? options.fill.toLowerCase() : '#111827'

  if (mode === 'silhouette') {
    const mask = imageDataToBinaryMask(imageData, options)
    const traced = traceMaskLayer(mask, width, height, { simplify, despeckle })
    if (!traced.pathCount) {
      throw new Error('Tidak ada area yang terlacak — coba threshold, invert, atau mode alpha')
    }
    const svg = wrapSvg(width, height, pathEl(traced.d, fill))
    return {
      svg,
      width,
      height,
      pathCount: traced.pathCount,
      layers: [{ color: fill, pathCount: traced.pathCount }]
    }
  }

  const data = imageData.data
  const pixels = []
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]])
  }
  const maxColors = clamp(Number(options.maxColors ?? 4), 2, 8)
  const centroids = quantizeColors(pixels, maxColors)
  const labels = new Int8Array(width * height)
  for (let p = 0; p < labels.length; p++) {
    const i = p * 4
    if (data[i + 3] < 128) labels[p] = -1
    else labels[p] = nearestCentroid([data[i], data[i + 1], data[i + 2]], centroids)
  }

  const skipLight = options.skipLight !== false
  const bodies = []
  for (let c = 0; c < centroids.length; c++) {
    if (skipLight && isLight(centroids[c])) continue
    const mask = new Uint8Array(width * height)
    let count = 0
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === c) {
        mask[i] = 1
        count++
      }
    }
    if (count < 4) continue
    const traced = traceMaskLayer(mask, width, height, { simplify, despeckle })
    if (!traced.pathCount) continue
    bodies.push({ color: rgbToHex(centroids[c]), d: traced.d, pathCount: traced.pathCount })
  }

  if (!bodies.length) {
    throw new Error('Tidak ada layer warna yang terlacak — matikan "abaikan putih" atau kurangi jumlah warna')
  }

  const svg = wrapSvg(
    width,
    height,
    bodies.map((b) => pathEl(b.d, b.color)).join('')
  )
  return {
    svg,
    width,
    height,
    pathCount: bodies.reduce((n, b) => n + b.pathCount, 0),
    layers: bodies.map((b) => ({ color: b.color, pathCount: b.pathCount }))
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar'))
    img.src = src
  })
}

export function readRasterFile(file) {
  if (!file) return Promise.reject(new Error('File tidak dipilih'))
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    return Promise.reject(new Error('Hanya PNG, JPG, atau WebP'))
  }
  if (file.size > PNG_TO_SVG_LIMITS.maxBytes) {
    return Promise.reject(new Error('Gambar terlalu besar (maks. 8 MB)'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

/** Canvas downscale → ImageData. Browser only. */
export async function rasterFileToImageData(file, options = {}) {
  const maxEdge = clamp(Number(options.maxEdge ?? PNG_TO_SVG_LIMITS.defaultEdge), 64, PNG_TO_SVG_LIMITS.maxEdge)
  const dataUrl = await readRasterFile(file)
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas tidak tersedia')
  ctx.drawImage(img, 0, 0, width, height)
  return { imageData: ctx.getImageData(0, 0, width, height), previewUrl: dataUrl, sourceWidth: img.width, sourceHeight: img.height }
}
