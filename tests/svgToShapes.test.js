import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'
import { parseSvgToShapes, parseSvgToShapeLayers, serializeShapes, deserializeShapes, buildLogoGroupFromShapes, readSvgFile } from '../utils/svgToShapes.js'
import { computeBoundsFromShapes } from '../utils/keychainTypographyCore.js'
import { shapesToRings } from '../utils/clickerManifold/meshUtils.js'
import { connectFootprint } from '../utils/connectedFootprint.js'
import { rasterToSvg } from '../utils/pngToSvg.js'

const window = new Window()
globalThis.DOMParser = window.DOMParser
test.after(async () => { delete globalThis.DOMParser; await window.happyDOM.close() })
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`
const area = (shapes) => shapes.reduce((sum, s) => sum + Math.abs(THREE.ShapeUtils.area(s.getPoints(48))) - s.holes.reduce((a, h) => a + Math.abs(THREE.ShapeUtils.area(h.getPoints(48))), 0), 0)
const near = (actual, expected, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)

test('SVG colours share one Y flip and keep their relative position through worker serialization', () => {
  const layers = parseSvgToShapeLayers(svg('<rect width="10" height="10" fill="red"/><rect x="20" y="30" width="10" height="10" fill="blue"/>'))
  const red = computeBoundsFromShapes(deserializeShapes(serializeShapes(layers[0].shapes)))
  const blue = computeBoundsFromShapes(layers[1].shapes)
  near(red.minY, 30)
  near(blue.minY, 0)
  near(blue.minX - red.minX, 20)
})

test('SVG2 href and legacy xlink instances preserve transforms, inherited paint and local definitions', () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs><rect id="box" width="10" height="5"/></defs>
    <use href="#box" x="20" transform="scale(2)" fill="red"/>
    <use xlink:href="#box" x="5" y="20" fill="blue"/>
  </svg>`
  const layers = parseSvgToShapeLayers(source)
  assert.deepEqual(layers.map((l) => l.color), ['#ff0000', '#0000ff'])
  near(area(layers[0].shapes), 200)
  near(computeBoundsFromShapes(layers[0].shapes).minX, 40)
  near(computeBoundsFromShapes(layers[1].shapes).minX, 5)
  assert.throws(() => parseSvgToShapes(svg('<defs><g id="loop"><use href="#loop"/></g></defs><use href="#loop"/>')), /berulang/)
})

test('SVG compound fills preserve holes, islands and overlapping evenodd/nonzero subpaths', () => {
  const nested = 'M0 0H20V20H0Z M5 5H15V15H5Z M8 8H12V12H8Z'
  const evenodd = parseSvgToShapes(svg(`<path fill-rule="evenodd" d="${nested}"/>`))
  near(area(evenodd), 316)
  assert.equal(evenodd.reduce((n, s) => n + s.holes.length, 0), 1)
  near(area(parseSvgToShapes(svg(`<path d="${nested}"/>`))), 400)
  const overlap = 'M0 0H10V10H0Z M5 0H15V10H5Z'
  near(area(parseSvgToShapes(svg(`<path fill-rule="evenodd" d="${overlap}"/>`))), 100)
  near(area(parseSvgToShapes(svg(`<path d="${overlap}"/>`))), 150)
  near(area(parseSvgToShapes(svg('<path d="M0 0L10 10L0 10L10 0Z"/>'))), 50)
})

test('SVG open strokes preserve width and do not fill the open interior', () => {
  const shapes = parseSvgToShapes(svg('<path fill="none" stroke="red" stroke-width="2" d="M0 0H10V10"/>'))
  near(area(shapes), 40)
  const b = computeBoundsFromShapes(shapes)
  near(b.width, 11)
  near(b.height, 11)
  const round = parseSvgToShapes(svg('<path fill="none" stroke="red" stroke-width="2" stroke-linecap="round" d="M0 0H10"/>'))
  near(area(round), 20 + Math.PI, 0.02)
})

test('SVG closed strokes keep their hole and use the stroke paint separately from fill', () => {
  const shapes = parseSvgToShapes(svg('<rect width="10" height="10" fill="none" stroke="red" stroke-width="2"/>'))
  near(area(shapes), 80)
  assert.equal(shapes[0].holes.length, 1)
  const layers = parseSvgToShapeLayers(svg('<rect width="10" height="10" fill="red" stroke="blue" stroke-width="2"/>'))
  assert.deepEqual(layers.map((l) => l.color), ['#ff0000', '#0000ff'])
})

test('SVG strokes preserve non-uniform transforms and reflected shapes have consistent solid/hole winding', () => {
  const shapes = parseSvgToShapes(svg('<g transform="scale(3 2)"><path fill="none" stroke="red" stroke-width="2" d="M0 0H10"/></g>'))
  const b = computeBoundsFromShapes(shapes)
  near(b.width, 30)
  near(b.height, 4)
  near(area(shapes), 120)
  const mirrored = parseSvgToShapes(svg('<path transform="scale(-1 1)" fill-rule="evenodd" d="M0 0H20V20H0Z M5 5H15V15H5Z"/>'))
  const rings = shapesToRings(mirrored)
  assert.ok(THREE.ShapeUtils.area(rings[0].map(([x, y]) => new THREE.Vector2(x, y))) > 0)
  assert.ok(THREE.ShapeUtils.area(rings[1].map(([x, y]) => new THREE.Vector2(x, y))) < 0)
})

test('invisible SVG elements and non-rendering definition geometry do not enlarge the model', () => {
  const shapes = parseSvgToShapes(svg(`<rect width="10" height="10"/>
    <g display="none"><rect x="100" width="100" height="100"/></g>
    <rect x="100" width="100" height="100" visibility="hidden"/>
    <g opacity="0"><rect x="100" width="100" height="100" opacity="1"/></g>
    <rect x="100" width="100" height="100" fill-opacity="0"/>
    <path d="M100 100H200" fill="none" stroke="red" stroke-opacity="0"/>
    <clipPath id="unused"><rect width="100" height="100"/></clipPath>`))
  near(area(shapes), 100)
  near(computeBoundsFromShapes(shapes).width, 10)
})

test('invalid, empty and unsupported artwork fails explicitly instead of silently changing its design', async () => {
  assert.throws(() => parseSvgToShapes('<html/>'), /tidak valid/)
  assert.throws(() => parseSvgToShapes(svg('<text>Hello</text><rect width="10" height="10"/>')), /teks.*path/)
  assert.throws(() => parseSvgToShapes(svg('<rect width="10" height="10" clip-path="url(#clip)"/>')), /clip-path/)
  assert.throws(() => parseSvgToShapes(svg('<path d="M0 0H10" stroke="red" stroke-dasharray="2 2"/>')), /stroke-dasharray/)
  await assert.rejects(readSvgFile({ name: 'raster.svg', size: 100, text: async () => svg('<image href="data:image/png;base64,AA"/>') }), /path vektor/)
})

test('small SVG viewBoxes retain geometry and zero logo gap is respected', () => {
  const shapes = parseSvgToShapes(svg('<rect width="0.0001" height="0.0001"/>'))
  const group = buildLogoGroupFromShapes(shapes, { svgSizeMm: 14, svgGapMm: 0 }, { minX: 20, maxX: 40, minY: 0, maxY: 10 })
  const b = computeBoundsFromShapes(group.shapes)
  near(b.width, 14)
  near(b.maxX, 20)
})

test('disconnected logo backing is joined while artwork remains separate', () => {
  const shapes = parseSvgToShapes(svg('<rect width="10" height="10"/><rect x="30" y="15" width="10" height="10"/>'))
  const connected = connectFootprint(shapes, 2)
  assert.equal(connected.length, 1)
  assert.equal(shapes.length, 2)
  assert.ok(area(connected) > 200)
  assert.ok(area(connected) < 280, 'connect with a short bridge, preserving the silhouette instead of filling its bounding box')
})

test('PNG tracing output retains its hole when imported as generator artwork', () => {
  const data = new Uint8ClampedArray(16 * 16 * 4)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const painted = x >= 2 && x < 14 && y >= 2 && y < 14 && !(x >= 6 && x < 10 && y >= 6 && y < 10)
    if (painted) data[(y * 16 + x) * 4 + 3] = 255
  }
  const result = rasterToSvg({ width: 16, height: 16, data }, { detectMode: 'alpha', simplify: 0, despeckle: 0 })
  const shapes = deserializeShapes(serializeShapes(parseSvgToShapes(result.svg)))
  near(area(shapes), 128)
  assert.equal(shapes[0].holes.length, 1)
})
