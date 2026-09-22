import test from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry } from 'three'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'
import { custom3mfToStl, inspectCustom3mf } from '../server/utils/custom3mf.js'
import { validateStl } from '../server/utils/stl.js'
import { validateSlicerUpload, enqueueSlicerJob } from '../server/utils/slicerQueue.js'
import { prepareSlicerInput, combinePlateSlicingResults } from '../server/utils/orcaSlicer.js'
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

test('multi-plate 3MF inspects and slices only the selected plate, including repeated object instances', async () => {
  const build = '<item objectid="1"/><item objectid="1" transform="2 0 0 0 2 0 0 0 1 0 0 0"/>'
  const metadata = `<config><object id="1"><metadata key="extruder" value="1"/></object>
    <plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Kecil"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/></model_instance></plate>
    <plate><metadata key="plater_id" value="2"/><metadata key="plater_name" value="Besar"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="1"/></model_instance></plate></config>`
  const bytes = file(model(undefined, build), { 'Metadata/model_settings.config': strToU8(metadata) })
  const first = inspectCustom3mf(bytes)
  const second = inspectCustom3mf(bytes, 2)
  assert.deepEqual(first.plates, [{ id: 1, name: 'Kecil' }, { id: 2, name: 'Besar' }])
  assert.equal(first.selectedPlate, 1)
  assert.deepEqual(first.size, [20, 20, 10])
  assert.equal(first.triangles, 12)
  assert.equal(second.selectedPlate, 2)
  assert.equal(second.plateName, 'Besar')
  assert.deepEqual(second.size, [40, 40, 10])
  assert.equal(second.triangles, 12)
  const prepared = await prepareSlicerInput(bytes, 'custom-order', false, { selectedPlate: 2, sourceColors: second.colors, colors: ['#ff0000'], slotMap: [0] })
  assert.equal(prepared.selectedPlate, 2)
  assert.equal(prepared.plateName, 'Besar')
  assert.deepEqual(validateStl(custom3mfToStl(prepared.bytes)), { triangles: 12, size: [40, 40, 10] })
  assert.throws(() => inspectCustom3mf(bytes, 3), /tidak tersedia/)
  await assert.rejects(() => enqueueSlicerJob({ file: bytes, filename: 'two.3mf', tool: 'custom-order', materialIds: [1] }), /Pilih plate 3MF/)
  await assert.rejects(() => enqueueSlicerJob({ file: bytes, filename: 'two.3mf', tool: 'custom-order', materialIds: [1], selectedPlate: 3 }), /tidak tersedia/)
  const db = {
    select: () => ({ from: () => ({ leftJoin: () => ({ where: async () => [{ id: 7, color: '#ffffff', type: 'filament', unit: 'gram', stockQuantity: 100, filamentTypeName: 'PLA' }] }) }) }),
    insert: () => ({ values: (value) => ({ returning: async () => [value] }) })
  }
  const job = await enqueueSlicerJob({ db, storage: { put: async () => {}, remove: async () => {} }, auth: { id: 1 }, file: bytes, filename: 'two.3mf', tool: 'custom-order', materialIds: [7], selectedPlate: 2 })
  assert.deepEqual(job.inputConfig.selectedPlates, [2])
  assert.deepEqual(job.inputConfig.plateNames, ['Besar'])
  const missing = metadata.replace('<metadata key="instance_id" value="1"/>', '<metadata key="instance_id" value="2"/>')
  assert.throws(() => inspectCustom3mf(file(model(undefined, build), { 'Metadata/model_settings.config': strToU8(missing) }), 2), /tidak memiliki plate/)
})

test('selected plate limits active colors and empty plates remain selectable for inspection', async () => {
  const resources = `<object id="1">${mesh()}</object><object id="2">${mesh()}</object>`
  const build = '<item objectid="1"/><item objectid="2"/>'
  const metadata = `<config><object id="1"><metadata key="extruder" value="1"/></object><object id="2"><metadata key="extruder" value="2"/></object>
    <plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Putih"/><model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/></model_instance></plate>
    <plate><metadata key="plater_id" value="2"/><metadata key="plater_name" value="Hitam"/><model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="0"/></model_instance></plate></config>`
  const bytes = file(model(resources, build), {
    'Metadata/model_settings.config': strToU8(metadata),
    'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: ['#ffffff', '#000000'] }))
  })
  assert.deepEqual(inspectCustom3mf(bytes, 1).colors, ['#ffffff'])
  const second = inspectCustom3mf(bytes, 2)
  assert.deepEqual(second.colors, ['#000000'])
  const combined = inspectCustom3mf(bytes, [1, 2])
  assert.deepEqual(combined.selectedPlates, [1, 2])
  assert.deepEqual(combined.colors, ['#ffffff', '#000000'])
  assert.equal(combined.triangles, 24)
  assert.deepEqual(combined.emptyPlates, [])
  assert.throws(() => inspectCustom3mf(bytes, [1, 1]), /tanpa duplikat/)
  const prepared = await prepareSlicerInput(bytes, 'custom-order', false, { selectedPlate: 2, sourceColors: second.colors, colors: ['#ff0000'], slotMap: [0] })
  assert.deepEqual(inspectCustom3mf(prepared.bytes).colors, ['#ff0000'])
  assert.equal(inspectCustom3mf(prepared.bytes).triangles, 12)
  const emptyPlate = metadata.replace('<model_instance><metadata key="object_id" value="1"/><metadata key="instance_id" value="0"/></model_instance>', '')
  const onlySecond = file(model(`<object id="2">${mesh()}</object>`, '<item objectid="2"/>'), { 'Metadata/model_settings.config': strToU8(emptyPlate) })
  assert.equal(inspectCustom3mf(onlySecond, 1).empty, true)
  assert.deepEqual(inspectCustom3mf(onlySecond, [1, 2]).emptyPlates, [1])
  assert.equal(inspectCustom3mf(onlySecond, 2).triangles, 12)
  assert.throws(() => custom3mfToStl(onlySecond, { selectedPlate: 1 }), /tidak memiliki model/)
})

test('multi-plate statistics sum per-plate time and material grams without mixing slots', () => {
  const config = { selectedPlates: [1, 2], sourceColors: ['#ffffff', '#000000'], materialIds: [8, 9], colors: ['#ffffff', '#000000'], slotMap: [0, 1] }
  const result = combinePlateSlicingResults([
    { selectedPlate: 1, plateName: 'Putih', totalGrams: 2.02, printTimeSeconds: 577, filamentGrams: [2.02], materialIds: [8], colors: ['#ffffff'], filamentChanges: 0, primeTower: false },
    { selectedPlate: 2, plateName: 'Hitam', totalGrams: 0.33, printTimeSeconds: 177, filamentGrams: [0.33], materialIds: [9], colors: ['#000000'], filamentChanges: 0, primeTower: false }
  ], config)
  assert.equal(result.totalGrams, 2.35)
  assert.equal(result.printTimeSeconds, 754)
  assert.deepEqual(result.filamentGrams, [2.02, 0.33])
  assert.deepEqual(result.selectedPlates, [1, 2])
  assert.deepEqual(result.plates.map((plate) => plate.id), [1, 2])
  assert.equal(result.primeTower, false)
  assert.throws(() => combinePlateSlicingResults([{ selectedPlate: 2, filamentGrams: [1], materialIds: [8] }], config), /tidak lengkap/)
})
