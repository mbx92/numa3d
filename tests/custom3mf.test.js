import test from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry } from 'three'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'
import { custom3mfToStl, inspectCustom3mf } from '../server/utils/custom3mf.js'
import { validateStl } from '../server/utils/stl.js'
import { validateSlicerUpload } from '../server/utils/slicerQueue.js'
import { prepareSlicerInput } from '../server/utils/orcaSlicer.js'
import { createPrintProjectExport } from '../utils/printProjectExport.js'

function mesh() {
  const geometry = new BoxGeometry(20, 20, 10)
  try {
    const position = geometry.getAttribute('position')
    const vertices = Array.from({ length: position.count }, (_, i) => `<vertex x="${position.getX(i)}" y="${position.getY(i)}" z="${position.getZ(i)}"/>`).join('')
    const faces = Array.from({ length: geometry.index.count / 3 }, (_, i) => `<triangle v1="${geometry.index.getX(i * 3)}" v2="${geometry.index.getX(i * 3 + 1)}" v3="${geometry.index.getX(i * 3 + 2)}"/>`).join('')
    return `<mesh><vertices>${vertices}</vertices><triangles>${faces}</triangles></mesh>`
  } finally { geometry.dispose() }
}
const model = (resources = `<object id="1">${mesh()}</object>`, build = '<item objectid="1"/>', unit = 'millimeter') => `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" unit="${unit}"><resources>${resources}</resources><build>${build}</build></model>`
function file(xml = model(), extras = {}, target = '/3D/3dmodel.model') {
  return Buffer.from(zipSync({
    '_rels/.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="${target}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Id="rel0"/></Relationships>`),
    '3D/3dmodel.model': strToU8(xml), ...extras
  }))
}

test('custom order accepts standard 3MF without generator metadata and rebuilds a clean Orca project using only active colors', async () => {
  const bytes = file(model(), { 'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: ['#ffffff', '#000000'], post_process: ['do-not-run'] })), 'Metadata/plate_1.gcode': strToU8('do-not-use') })
  const upload = validateSlicerUpload({ file: bytes, filename: 'box.3mf', tool: 'custom-order' })
  assert.equal(upload.format, '3mf')
  assert.equal(upload.includeProfile, false)
  const prepared = await prepareSlicerInput(bytes, 'custom-order')
  assert.equal(prepared.format, '3mf')
  assert.deepEqual(validateStl(custom3mfToStl(prepared.bytes)), { triangles: 12, size: [20, 20, 10] })
  assert.deepEqual(prepared.settings.filament_colour, ['#ffffff'])
  assert.deepEqual(prepared.settings.post_process, [])
  assert.equal(prepared.settings.enable_prime_tower, '0')
  assert.equal(prepared.bytes.includes(Buffer.from('do-not-run')), false)
  const long = validateSlicerUpload({ file: bytes, filename: `${'a'.repeat(200)}.3mf`, tool: 'custom-order' })
  assert.equal(long.filename.length, 180)
  assert.equal(long.filename.endsWith('.3mf'), true)
})

test('3MF import follows local submodels, nested transforms, unit conversion and printable instances', () => {
  const root = model('<object id="2"><components><component objectid="1" p:path="/3D/Objects/box.model" transform="1 0 0 0 1 0 0 0 1 5 0 0"/></components></object>', '<item objectid="2" transform="-1 0 0 0 1 0 0 0 1 30 0 0"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 30 0 0"/><item objectid="999" printable="0"/>')
  const converted = custom3mfToStl(file(root, { '3D/Objects/box.model': strToU8(model()) }))
  assert.deepEqual(validateStl(converted), { triangles: 24, size: [30, 20, 10] })
  assert.deepEqual(validateStl(custom3mfToStl(file(model(undefined, undefined, 'centimeter')))), { triangles: 12, size: [200, 200, 100] })
})

test('generator 3MF retains multiple colors for Custom Order', async () => {
  const geometry = new BoxGeometry(10, 10, 2)
  try {
    const exporter = createPrintProjectExport([{ name: 'Box', parts: [{ geometry, color: '#ffffff' }, { geometry, color: '#000000' }] }], 'sample')
    const bytes = Buffer.from(await exporter().arrayBuffer())
    const prepared = await prepareSlicerInput(bytes, 'custom-order')
    assert.deepEqual(prepared.settings.filament_colour, ['#ffffff', '#000000'])
    assert.equal(prepared.settings.enable_prime_tower, '1')
    assert.equal(validateStl(custom3mfToStl(prepared.bytes)).triangles, 24)
  } finally { geometry.dispose() }
})

test('3MF import rejects external models, entity declarations, broken topology, cycles and oversize geometry', () => {
  assert.throws(() => custom3mfToStl(Buffer.from('not a 3mf')), /Format file 3MF/)
  assert.throws(() => custom3mfToStl(file(model(), {}, 'https://example.com/box.model')), /referensi model lokal/)
  assert.throws(() => custom3mfToStl(file('<!DOCTYPE model [<!ENTITY x "boom">]>' + model())), /XML/)
  assert.throws(() => custom3mfToStl(file(model().replace('v1="0"', 'v1="99999"'))), /Indeks/)
  assert.throws(() => custom3mfToStl(file(model().replace('x="10"', 'x="NaN"'))), /Koordinat/)
  assert.throws(() => custom3mfToStl(file(model('<object id="1"><components><component objectid="1"/></components></object>'))), /kompleks atau berulang/)
  assert.throws(() => custom3mfToStl(file(model(undefined, undefined, 'meter'))), /area cetak/)
  assert.throws(() => custom3mfToStl(file(model(undefined, '<item objectid="1" printable="0"/>'))), /dapat dicetak/)
  assert.throws(() => custom3mfToStl(file(model(undefined, '<item objectid="1" transform="1 2 3"/>'))), /Transformasi/)
})

test('core face colors and painting survive mapping; selecting one substitute merges slots', async () => {
  const painted = mesh().replace('<triangle ', '<triangle paint_color="841" ')
  const bytes = file(model(`<object id="1">${painted}</object>`), { 'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: ['#ffffff', '#000000', '#ff0000'] })) })
  assert.deepEqual(inspectCustom3mf(bytes).colors, ['#ffffff', '#000000'])
  const prepared = await prepareSlicerInput(bytes, 'custom-order', false, { sourceColors: ['#ffffff', '#000000'], colors: ['#ff0000'], slotMap: [0, 0] })
  const xml = strFromU8(unzipSync(prepared.bytes)['3D/3dmodel.model'])
  assert.match(xml, /paint_color="441"/)
  assert.deepEqual(prepared.settings.filament_colour, ['#ff0000'])
  const solid = mesh().replace('<triangle ', '<triangle pid="3" p1="1" ')
  const core = file(model(`<basematerials id="3"><base name="white" displaycolor="#ffffff"/><base name="black" displaycolor="#000000"/></basematerials><object id="1" pid="3" pindex="0">${solid}</object>`))
  assert.deepEqual(inspectCustom3mf(core).colors, ['#ffffff', '#000000'])
})
