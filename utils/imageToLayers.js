// Kuantisasi gambar → layer warna + bentuk 2D (browser only).
import * as THREE from 'three'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { unionTextBodies } from './shapeClipper.js'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar'))
    img.src = src
  })
}

function colorDist(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

/** K-means sederhana untuk kuantisasi warna. */
function quantizeColors(pixels, k) {
  const samples = []
  for (let i = 0; i < pixels.length; i += 16) {
    const p = pixels[i]
    if (p[3] < 128) continue
    samples.push([p[0], p[1], p[2]])
  }
  if (!samples.length) throw new Error('Gambar kosong atau transparan penuh')

  let centroids = samples.slice(0, Math.min(k, samples.length))
  while (centroids.length < k) {
    centroids.push(samples[Math.floor(Math.random() * samples.length)])
  }

  for (let iter = 0; iter < 12; iter++) {
    const groups = Array.from({ length: k }, () => [])
    for (const s of samples) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const d = colorDist(s, centroids[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      groups[best].push(s)
    }
    centroids = groups.map((g, i) => {
      if (!g.length) return centroids[i]
      const sum = [0, 0, 0]
      for (const p of g) {
        sum[0] += p[0]
        sum[1] += p[1]
        sum[2] += p[2]
      }
      return [Math.round(sum[0] / g.length), Math.round(sum[1] / g.length), Math.round(sum[2] / g.length)]
    })
  }

  return centroids
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
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

/** Gabungkan sel grid bersebelahan jadi persegi panjang, lalu union. */
function maskToShapes(mask, gridW, gridH, cellSizeMm) {
  const rects = []
  const visited = new Uint8Array(gridW * gridH)

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const idx = y * gridW + x
      if (!mask[idx] || visited[idx]) continue

      let w = 1
      while (x + w < gridW && mask[y * gridW + x + w] && !visited[y * gridW + x + w]) w++

      let h = 1
      outer: while (y + h < gridH) {
        for (let dx = 0; dx < w; dx++) {
          const i = (y + h) * gridW + x + dx
          if (!mask[i] || visited[i]) break outer
        }
        h++
      }

      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) visited[(y + dy) * gridW + x + dx] = 1
      }

      const ox = (x - gridW / 2) * cellSizeMm
      const oy = (gridH / 2 - y - h) * cellSizeMm
      const shape = new THREE.Shape()
      shape.moveTo(ox, oy)
      shape.lineTo(ox + w * cellSizeMm, oy)
      shape.lineTo(ox + w * cellSizeMm, oy + h * cellSizeMm)
      shape.lineTo(ox, oy + h * cellSizeMm)
      shape.closePath()
      rects.push(shape)
    }
  }

  if (!rects.length) return []
  return unionTextBodies(rects)
}

export function readImageFile(file) {
  if (!file) return Promise.reject(new Error('File tidak dipilih'))
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    return Promise.reject(new Error('Hanya PNG, JPG, atau WebP'))
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error('Gambar terlalu besar (maks. 2 MB)'))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Proses gambar → layer warna dengan THREE.Shape per layer.
 * @returns {{ layers: Array<{color, shapes, index}>, bounds: object, widthMm, heightMm }}
 */
export async function imageToLayers(imageDataUrl, options = {}) {
  const maxColors = Math.min(Math.max(Number(options.maxColors) || 4, 2), 8)
  const maxSizeMm = Number(options.maxSizeMm) || 80
  const maxGrid = 96

  const img = await loadImage(imageDataUrl)
  const scale = Math.min(1, maxGrid / Math.max(img.width, img.height))
  const gridW = Math.max(1, Math.round(img.width * scale))
  const gridH = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = gridW
  canvas.height = gridH
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, gridW, gridH)
  const { data } = ctx.getImageData(0, 0, gridW, gridH)

  const pixels = []
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]])
  }

  const centroids = quantizeColors(pixels, maxColors)
  const labels = new Int8Array(gridW * gridH)
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const i = (y * gridW + x) * 4
      const p = [data[i], data[i + 1], data[i + 2]]
      if (data[i + 3] < 128) labels[y * gridW + x] = -1
      else labels[y * gridW + x] = nearestCentroid(p, centroids)
    }
  }

  const aspect = gridW / gridH
  let widthMm, heightMm
  if (aspect >= 1) {
    widthMm = maxSizeMm
    heightMm = maxSizeMm / aspect
  } else {
    heightMm = maxSizeMm
    widthMm = maxSizeMm * aspect
  }
  const cellSizeMm = widthMm / gridW

  const layers = []
  for (let c = 0; c < centroids.length; c++) {
    const mask = new Uint8Array(gridW * gridH)
    let count = 0
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === c) {
        mask[i] = 1
        count++
      }
    }
    if (count < 2) continue
    const shapes = maskToShapes(mask, gridW, gridH, cellSizeMm)
    if (!shapes.length) continue
    layers.push({
      index: c,
      color: rgbToHex(centroids[c]),
      shapes,
      isBackground: false
    })
  }

  if (!layers.length) throw new Error('Gambar tidak menghasilkan area warna — coba gambar dengan kontras lebih tinggi')

  layers.sort((a, b) => {
    const area = (sh) => {
      const bnd = computeBoundsFromShapes(sh)
      return bnd.width * bnd.height
    }
    return area(b.shapes) - area(a.shapes)
  })
  if (layers.length) layers[0].isBackground = true

  const allShapes = layers.flatMap((l) => l.shapes)
  const bounds = computeBoundsFromShapes(allShapes)

  return { layers, bounds, widthMm, heightMm, gridW, gridH }
}
