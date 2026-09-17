import jsQR from 'jsqr'

export const QR_IMAGE_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxEdge: 1600
}

function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function tryDecode(data, width, height) {
  if (!width || !height || data.length < width * height * 4) return null
  try {
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })
  } catch {
    return null
  }
}

function cropImageData(imageData, x0, y0, x1, y1) {
  const width = Math.max(1, x1 - x0)
  const height = Math.max(1, y1 - y0)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const src = ((y0 + y) * imageData.width + x0) * 4
    data.set(imageData.data.subarray(src, src + width * 4), y * width * 4)
  }
  return { data, width, height }
}

/** Tight box around dark pixels, padded so finder patterns keep a quiet zone. */
export function darkQrCrop(imageData, lumaMax = 95) {
  const { width, height, data } = imageData
  let minX = width, minY = height, maxX = 0, maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 32) continue
      if (luma(data[i], data[i + 1], data[i + 2]) > lumaMax) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  const pad = Math.ceil(Math.max(maxX - minX, maxY - minY) * 0.14)
  return {
    x0: Math.max(0, minX - pad),
    y0: Math.max(0, minY - pad),
    x1: Math.min(width, maxX + 1 + pad),
    y1: Math.min(height, maxY + 1 + pad)
  }
}

function otsuThreshold(imageData) {
  const hist = new Uint32Array(256)
  let count = 0
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 32) continue
    hist[Math.round(luma(data[i], data[i + 1], data[i + 2]))]++
    count++
  }
  if (!count) return 128
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, best = 128, bestVar = -1
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = count - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const variance = wB * wF * (mB - mF) ** 2
    if (variance > bestVar) { bestVar = variance; best = t }
  }
  return best
}

function binarize(imageData, threshold) {
  const { width, height, data } = imageData
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    const v = luma(data[i], data[i + 1], data[i + 2]) <= threshold ? 0 : 255
    out[i] = out[i + 1] = out[i + 2] = v
    out[i + 3] = 255
  }
  return { data: out, width, height }
}

function padWhite(image, pad) {
  const p = Math.max(8, pad | 0)
  const width = image.width + p * 2
  const height = image.height + p * 2
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = 255
    data[i + 3] = 255
  }
  for (let y = 0; y < image.height; y++) {
    data.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), ((y + p) * width + p) * 4)
  }
  return { data, width, height }
}

function scaleNearest(image, factor) {
  const width = Math.max(1, Math.round(image.width * factor))
  const height = Math.max(1, Math.round(image.height * factor))
  if (width === image.width && height === image.height) return image
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / factor))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / factor))
      const s = (sy * image.width + sx) * 4
      const d = (y * width + x) * 4
      data[d] = image.data[s]
      data[d + 1] = image.data[s + 1]
      data[d + 2] = image.data[s + 2]
      data[d + 3] = 255
    }
  }
  return { data, width, height }
}

function looksLikeWhatsApp(payload) {
  return /wa\.me|whatsapp\.com|whatsapp:/i.test(payload)
}

function* variants(imageData) {
  yield imageData
  const crop = darkQrCrop(imageData)
  if (crop && (crop.x0 > 0 || crop.y0 > 0 || crop.x1 < imageData.width || crop.y1 < imageData.height)) {
    yield cropImageData(imageData, crop.x0, crop.y0, crop.x1, crop.y1)
  }
}

/**
 * Baca payload QR dari ImageData (JPEG/PNG kartu WhatsApp, foto, atau tangkapan layar).
 * QR dicetak ulang dari payload, bukan dari raster, agar modul tetap rapi.
 *
 * jsQR sering gagal pada JPEG WhatsApp yang terpotong rapat atau beresolusi besar
 * (logo di tengah + tanpa quiet zone). Binarisasi, padding, dan beberapa skala memperbaiki itu.
 */
export function decodeQrFromImageData(imageData) {
  if (!imageData?.width || !imageData.height || !imageData.data) {
    throw new Error('Gambar tidak valid')
  }
  const targets = [280, 360, 420, 520, 640]
  for (const source of variants(imageData)) {
    const hit = tryDecode(source.data, source.width, source.height)
    if (hit?.data) return finish(hit.data)
    const binary = binarize(source, otsuThreshold(source))
    const pad = Math.max(24, Math.round(Math.min(binary.width, binary.height) * 0.12))
    const padded = padWhite(binary, pad)
    const native = tryDecode(padded.data, padded.width, padded.height)
    if (native?.data) return finish(native.data)
    const longEdge = Math.max(padded.width, padded.height)
    for (const target of targets) {
      const factor = target / longEdge
      if (Math.abs(factor - 1) < 0.08) continue
      const scaled = scaleNearest(padded, factor)
      const scaledHit = tryDecode(scaled.data, scaled.width, scaled.height)
      if (scaledHit?.data) return finish(scaledHit.data)
    }
  }
  throw new Error('QR tidak terbaca. Unggah JPEG kartu WhatsApp yang jelas, dengan seluruh kotak QR terlihat.')
}

function finish(payloadRaw) {
  const payload = String(payloadRaw)
  if (!payload.trim()) throw new Error('QR WhatsApp kosong')
  if (new TextEncoder().encode(payload).length > 1024) {
    throw new Error('Konten QR terlalu panjang (maksimal 1.024 byte)')
  }
  return { payload, whatsapp: looksLikeWhatsApp(payload) }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar QR'))
    img.src = src
  })
}

export function readQrImageFile(file) {
  if (!file) return Promise.reject(new Error('File tidak dipilih'))
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error('Unggah JPEG, PNG, atau WebP dari QR WhatsApp')
  }
  if (file.size > QR_IMAGE_LIMITS.maxBytes) throw new Error('Gambar terlalu besar (maks. 8 MB)')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

/** Browser only: file gambar → ImageData + pratinjau. */
export async function qrImageFileToImageData(file, options = {}) {
  const maxEdge = Math.min(QR_IMAGE_LIMITS.maxEdge, Math.max(256, Number(options.maxEdge) || QR_IMAGE_LIMITS.maxEdge))
  const dataUrl = await readQrImageFile(file)
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
  return {
    imageData: ctx.getImageData(0, 0, width, height),
    previewUrl: dataUrl,
    sourceWidth: img.width,
    sourceHeight: img.height
  }
}

export async function decodeWhatsappQrFile(file) {
  const loaded = await qrImageFileToImageData(file)
  const decoded = decodeQrFromImageData(loaded.imageData)
  return { ...loaded, ...decoded }
}
