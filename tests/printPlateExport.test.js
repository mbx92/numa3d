import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, Vector3 } from 'three'
import { unzipSync, strFromU8 } from 'fflate'
import { layoutPrintGroups } from '../utils/printPlateLayout.js'
import { partsTo3mfBuffer, printGroupsTo3mfBuffer } from '../utils/keychainExport.js'

const part = (w, d, h, z = 0, color = '#ff0000') => ({ geometry: new BoxGeometry(w, d, h).translate(0, 0, z), color })
function bounds(group) {
  const box = new Box3()
  for (const p of group.parts) {
    p.geometry.computeBoundingBox()
    box.union(p.geometry.boundingBox)
  }
  return box
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} != ${b}`)
const dispose = (groups) => groups.forEach((g) => g.parts.forEach((p) => p.geometry.dispose()))

test('centers separate objects, grounds whole color groups, preserves source geometry', () => {
  const groups = [
    { name: 'Base', parts: [part(50, 30, 5)] },
    { name: 'Insert', parts: [part(40, 20, 2, 10), part(10, 10, 2, 12, '#0000ff')] }
  ]
  const before = groups.flatMap((g) => g.parts.map((p) => Array.from(p.geometry.attributes.position.array)))
  const result = layoutPrintGroups(groups)
  const boxes = result.map(bounds)
  boxes.forEach((box) => { near(box.min.z, 0); assert.ok(box.min.x >= 5 && box.max.x <= 255 && box.min.y >= 5 && box.max.y <= 255) })
  assert.ok(boxes[1].min.x - boxes[0].max.x >= 5.9999)
  const all = boxes[0].clone().union(boxes[1]).getCenter(new Vector3())
  near(all.x, 130); near(all.y, 130)
  result[1].parts[1].geometry.computeBoundingBox()
  near(result[1].parts[1].geometry.boundingBox.min.z, 2)
  assert.deepEqual(groups.flatMap((g) => g.parts.map((p) => Array.from(p.geometry.attributes.position.array))), before)
  dispose(result); dispose(groups)
})

test('face-down rotation moves all colors together and quarter-turn packing fits narrow space', () => {
  const groups = [{ name: 'Lid', faceDown: true, parts: [part(60, 30, 2, 10), part(10, 10, 2, 12)] }]
  const result = layoutPrintGroups(groups, { width: 45, depth: 80, height: 50, margin: 5, gap: 6 })
  const box = bounds(result[0]); near(box.max.x - box.min.x, 30); near(box.min.z, 0)
  near(result[0].parts[0].geometry.boundingBox.min.z, 2)
  dispose(result); dispose(groups)
})

test('rejects overflow, excessive height, empty and nonfinite geometry without scaling', (t) => {
  t.mock.method(console, 'error', () => {}) // Three reports the intentionally invalid NaN fixture.
  for (const groups of [
    [{ name: 'Big', parts: [part(251, 251, 2)] }],
    [{ name: 'Tall', parts: [part(10, 10, 261)] }],
    [{ name: 'A', parts: [part(200, 200, 2)] }, { name: 'B', parts: [part(200, 200, 2)] }],
    [{ name: 'Invalid', parts: [part(10, 10, 2, NaN)] }],
    []
  ]) {
    assert.throws(() => layoutPrintGroups(groups))
    dispose(groups)
  }
})

test('3MF records separate printable objects, color parts, one plate and matching extruder slots', () => {
  const groups = [{ name: 'Base & tray', parts: [part(40, 30, 5)] },
    { name: 'Insert', parts: [part(30, 20, 2), part(10, 10, 2, 2, '#0000ff')] }]
  const zip = unzipSync(new Uint8Array(printGroupsTo3mfBuffer(groups, 'Test & print')))
  const model = strFromU8(zip['3D/3dmodel.model'])
  const config = strFromU8(zip['Metadata/model_settings.config'])
  const settings = JSON.parse(strFromU8(zip['Metadata/project_settings.config']))
  assert.equal([...model.matchAll(/<item /g)].length, 2)
  assert.equal([...config.matchAll(/<part /g)].length, 3)
  assert.equal([...config.matchAll(/<model_instance>/g)].length, 2)
  assert.match(config, /Base &amp; tray/)
  assert.match(config, /key="extruder" value="2"/)
  assert.deepEqual(settings.printable_area, ['0x0', '260x0', '260x260', '0x260'])
  assert.equal(settings.printable_height, '260')
  assert.deepEqual(settings.filament_colour, ['#FF0000', '#0000FF'])
  // Export must not inject temperature or machine G-code overrides.
  assert.equal(settings.machine_start_gcode, undefined)
  assert.equal(settings.nozzle_temperature, undefined)
  const legacy = unzipSync(new Uint8Array(partsTo3mfBuffer(groups[1].parts)))
  assert.equal(legacy['Metadata/project_settings.config'], undefined)
  assert.equal([...strFromU8(legacy['3D/3dmodel.model']).matchAll(/<item /g)].length, 1)
  dispose(groups)
})
