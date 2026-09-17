import test from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode/lib/core/qrcode.js'
import { decodeQrFromImageData, darkQrCrop } from '../utils/qrFromImage.js'

function paintQr(payload, { pad = 24, scale = 5, quiet = 4, bg = [255, 255, 255], card = [255, 255, 255], canvas = 0, logo = 0 } = {}) {
  const code = QRCode.create(payload, { errorCorrectionLevel: 'H' })
  const size = code.modules.size
  const inner = (size + quiet * 2) * scale
  const n = canvas || inner + pad * 2
  const data = new Uint8ClampedArray(n * n * 4)
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = bg[0]
    data[i * 4 + 1] = bg[1]
    data[i * 4 + 2] = bg[2]
    data[i * 4 + 3] = 255
  }
  const ox = Math.floor((n - inner) / 2)
  const oy = ox
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const i = ((oy + y) * n + (ox + x)) * 4
      data[i] = card[0]
      data[i + 1] = card[1]
      data[i + 2] = card[2]
    }
  }
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!code.modules.get(row, col)) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = ox + (col + quiet) * scale + dx
          const y = oy + (row + quiet) * scale + dy
          const i = (y * n + x) * 4
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
        }
      }
    }
  }
  if (logo > 0) {
    const cx = n / 2, cy = n / 2, r = inner * logo / 2
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
        const i = (y * n + x) * 4
        data[i] = data[i + 1] = data[i + 2] = 255
      }
    }
  }
  return { data, width: n, height: n }
}

test('decodeQrFromImageData reads a WhatsApp-style payload from a painted QR', () => {
  const payload = 'https://wa.me/qr/ABCDEF123456'
  const image = paintQr(payload)
  const decoded = decodeQrFromImageData(image)
  assert.equal(decoded.payload, payload)
  assert.equal(decoded.whatsapp, true)
})

test('decodeQrFromImageData crops a QR off a green contact card background', () => {
  const payload = 'https://wa.me/6281234567890'
  const image = paintQr(payload, { pad: 90, bg: [37, 211, 102], canvas: 420 })
  const crop = darkQrCrop(image)
  assert.ok(crop)
  assert.ok(crop.x1 - crop.x0 < image.width)
  const decoded = decodeQrFromImageData(image)
  assert.equal(decoded.payload, payload)
})

test('non-WhatsApp payloads decode with a warning flag', () => {
  const payload = 'https://example.com/menu'
  const decoded = decodeQrFromImageData(paintQr(payload))
  assert.equal(decoded.payload, payload)
  assert.equal(decoded.whatsapp, false)
})

test('tight-cropped large WhatsApp QR without quiet zone still decodes', () => {
  const payload = 'https://wa.me/qr/QSOKYH45W6FUL1'
  const image = paintQr(payload, { pad: 0, quiet: 0, scale: 22, logo: 0.28 })
  assert.ok(image.width > 600)
  const decoded = decodeQrFromImageData(image)
  assert.equal(decoded.payload, payload)
  assert.equal(decoded.whatsapp, true)
})

test('blank images are rejected', () => {
  const data = new Uint8ClampedArray(32 * 32 * 4).fill(255)
  assert.throws(() => decodeQrFromImageData({ data, width: 32, height: 32 }), /QR tidak terbaca/)
})
