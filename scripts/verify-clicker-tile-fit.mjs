/**
 * Assert organic tile silhouettes contain the switch clearance square.
 * Run: node scripts/verify-clicker-tile-fit.mjs
 */
import {
  fitShapeRadius,
  boundsFromShape,
  shapeForKind
} from '../utils/clickerBaseShapes.js'

const pocket = 18.5
const switchClear = pocket + 3
const margin = 1.25
const neededHalf = switchClear / 2 + margin
const minBounds = switchClear + 2 * margin

function pointInRing(x, y, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function rectInside(shape, half) {
  const pts = shape.getPoints(96)
  const samples = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const x = -half + 2 * half * t
    const y = -half + 2 * half * t
    samples.push([x, -half], [x, half], [-half, y], [half, y])
  }
  for (let iy = 0; iy <= 4; iy++) {
    for (let ix = 0; ix <= 4; ix++) {
      samples.push([-half + (half * ix) / 2, -half + (half * iy) / 2])
    }
  }
  return samples.every(([x, y]) => pointInRing(x, y, pts))
}

let failed = 0
for (const kind of ['circle', 'flower', 'heart']) {
  const r = fitShapeRadius(kind, neededHalf, neededHalf)
  const shape = shapeForKind(kind, r, 1)
  const b = boundsFromShape(shape)
  const okContain = rectInside(shape, neededHalf)
  const okBounds = b.width >= minBounds - 1e-6 && b.height >= minBounds - 1e-6
  if (!okContain || !okBounds) {
    console.error('FAIL', kind, { r, b, okContain, okBounds, neededHalf, minBounds })
    failed++
  } else {
    console.log('ok', kind, { r: +r.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) })
  }
}

const flower = fitShapeRadius('flower', 10.75, 10.75)
const fs = shapeForKind('flower', flower, 1)
const fb = boundsFromShape(fs)
if (!rectInside(fs, 10.75) || fb.width < 21.5 || fb.height < 21.5) {
  console.error('FAIL flower@10.75', { flower, fb })
  failed++
} else {
  console.log('ok flower@10.75', { r: +flower.toFixed(2), w: +fb.width.toFixed(2), h: +fb.height.toFixed(2) })
}

const circle = fitShapeRadius('circle', 10.75, 10.75)
const expect = 10.75 * Math.SQRT2
if (Math.abs(circle - expect) > 0.02) {
  console.error('FAIL circle radius', circle, expect)
  failed++
} else {
  console.log('ok circle@10.75', +circle.toFixed(3))
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall tile-fit assertions passed')
