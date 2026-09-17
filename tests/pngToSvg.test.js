import test from 'node:test'
import assert from 'node:assert/strict'
import {
  imageDataToBinaryMask,
  despeckleMask,
  maskToContours,
  simplifyClosedContour,
  rasterToSvg
} from '../utils/pngToSvg.js'

function makeImage(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const [r, g, b, a] = paint(x, y)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { width, height, data }
}

function filledRect(x0, y0, x1, y1) {
  return (x, y) => (x >= x0 && x < x1 && y >= y0 && y < y1 ? [16, 16, 16, 255] : [250, 250, 250, 255])
}

test('silhouette traces a solid rectangle into a closed SVG path', () => {
  const image = makeImage(12, 12, filledRect(3, 3, 9, 9))
  const result = rasterToSvg(image, { mode: 'silhouette', simplify: 0.6, despeckle: 0, detectMode: 'luma' })
  assert.equal(result.width, 12)
  assert.equal(result.height, 12)
  assert.equal(result.pathCount, 1)
  assert.match(result.svg, /viewBox="0 0 12 12"/)
  assert.match(result.svg, /fill-rule="evenodd"/)
  assert.doesNotMatch(result.svg, /<image/i)
  assert.equal((result.svg.match(/Z/g) || []).length, 1)
  const d = result.svg.match(/d="([^"]+)"/)[1]
  assert.match(d, /^M/)
  assert.ok(d.includes('Z'))
})

test('holes stay open with evenodd (ring)', () => {
  const image = makeImage(16, 16, (x, y) => {
    const inOuter = x >= 2 && x < 14 && y >= 2 && y < 14
    const inHole = x >= 6 && x < 10 && y >= 6 && y < 10
    return inOuter && !inHole ? [0, 0, 0, 255] : [255, 255, 255, 255]
  })
  const result = rasterToSvg(image, { mode: 'silhouette', simplify: 0.5, despeckle: 0, detectMode: 'luma' })
  assert.equal(result.pathCount, 2)
  assert.equal((result.svg.match(/Z/g) || []).length, 2)
})

test('alpha detection treats transparent pixels as background', () => {
  const image = makeImage(8, 8, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? [200, 40, 40, 255] : [0, 0, 0, 0]))
  const mask = imageDataToBinaryMask(image, { detectMode: 'alpha' })
  const on = [...mask].reduce((n, v) => n + v, 0)
  assert.equal(on, 16)
  const result = rasterToSvg(image, { mode: 'silhouette', detectMode: 'alpha', simplify: 0.5, despeckle: 0 })
  assert.ok(result.pathCount >= 1)
})

test('despeckle removes isolated pixels without eating the main blob', () => {
  const mask = new Uint8Array(10 * 10)
  for (let y = 2; y < 8; y++) {
    for (let x = 2; x < 8; x++) mask[y * 10 + x] = 1
  }
  mask[0] = 1
  mask[9] = 1
  const cleaned = despeckleMask(mask, 10, 10, 4)
  assert.equal(cleaned[0], 0)
  assert.equal(cleaned[9], 0)
  assert.equal(cleaned[2 * 10 + 2], 1)
})

test('invert flips foreground and empty masks throw', () => {
  const white = makeImage(6, 6, () => [255, 255, 255, 255])
  assert.throws(() => rasterToSvg(white, { mode: 'silhouette', detectMode: 'luma', despeckle: 0 }), /Tidak ada area/)
  const inverted = rasterToSvg(white, { mode: 'silhouette', detectMode: 'luma', invert: true, despeckle: 0, simplify: 0.5 })
  assert.ok(inverted.pathCount >= 1)
})

test('simplify collapses a staircase into fewer points', () => {
  const stair = []
  for (let i = 0; i <= 10; i++) stair.push([i, 0])
  stair.push([10, 8], [0, 8], [0, 0])
  const simple = simplifyClosedContour(stair, 0.8)
  assert.ok(simple.length < stair.length)
  assert.ok(simple.length >= 4)
})

test('color mode emits a filled path per quantized region', () => {
  const image = makeImage(12, 8, (x) => (x < 6 ? [220, 40, 40, 255] : [40, 80, 200, 255]))
  const result = rasterToSvg(image, {
    mode: 'color',
    maxColors: 2,
    skipLight: false,
    simplify: 0.6,
    despeckle: 0
  })
  assert.equal(result.layers.length, 2)
  assert.ok(result.svg.includes('<path'))
  assert.ok(result.pathCount >= 2)
})

test('pixel contours of a 2x2 blob are a 2x2 rectangle', () => {
  const mask = new Uint8Array(6 * 6)
  mask[2 * 6 + 2] = 1
  mask[2 * 6 + 3] = 1
  mask[3 * 6 + 2] = 1
  mask[3 * 6 + 3] = 1
  const loops = maskToContours(mask, 6, 6)
  assert.equal(loops.length, 1)
  const simple = simplifyClosedContour(loops[0], 0.4)
  const xs = simple.map((p) => p[0])
  const ys = simple.map((p) => p[1])
  assert.equal(Math.min(...xs), 2)
  assert.equal(Math.max(...xs), 4)
  assert.equal(Math.min(...ys), 2)
  assert.equal(Math.max(...ys), 4)
})
