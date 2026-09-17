import test from 'node:test'
import assert from 'node:assert/strict'
import { CLICKER_DEFAULTS, resolveClickerOptions } from '../utils/clickerPresets.js'

test('clicker text/SVG relief defaults to 2 mm and clamps', () => {
  assert.equal(CLICKER_DEFAULTS.imageDepthMm, 2)
  assert.equal(resolveClickerOptions({}).imageDepthMm, 2)
  assert.equal(resolveClickerOptions({ imageDepthMm: 0.1 }).imageDepthMm, 0.4)
  assert.equal(resolveClickerOptions({ imageDepthMm: 9 }).imageDepthMm, 4)
  assert.equal(resolveClickerOptions({ imageDepthMm: 1.2 }).imageDepthMm, 1.2)
})

test('removed heart, star and flower shapes fall back to square', () => {
  assert.equal(resolveClickerOptions({ shapeMode: 'rect', baseShape: 'heart' }).baseShape, 'square')
  assert.equal(resolveClickerOptions({ shapeMode: 'svg', baseShape: 'star' }).baseShape, 'square')
  assert.equal(resolveClickerOptions({ shapeMode: 'rect', baseShape: 'flower' }).baseShape, 'square')
  assert.deepEqual(
    resolveClickerOptions({
      shapeMode: 'rect',
      text: 'AB',
      baseShape: 'square',
      letterShapes: ['heart', 'star']
    }).letterShapes,
    ['square', 'square']
  )
})
