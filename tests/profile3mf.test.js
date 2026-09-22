import test from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry } from 'three'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { createPrintProjectExport } from '../utils/printProjectExport.js'
import { convertProfile3mf, inspectProfile3mf } from '../server/utils/profile3mf.js'
import { inspectCustom3mf } from '../server/utils/custom3mf.js'
import { prepareSlicerInput } from '../server/utils/orcaSlicer.js'

async function source3mf() {
  const geometry = new BoxGeometry(20, 18, 10)
  try {
    const export3mf = createPrintProjectExport([{ name: 'Box', parts: [{ geometry, color: '#d3c5a3' }] }], 'makerworld-box')
    const archive = unzipSync(new Uint8Array(await export3mf().arrayBuffer()))
    const settingsPath = 'Metadata/project_settings.config'
    const settings = JSON.parse(strFromU8(archive[settingsPath]))
    Object.assign(settings, {
      printer_settings_id: 'Bambu Lab A1 0.4 nozzle',
      printer_model: 'Bambu Lab A1',
      print_settings_id: '0.20mm Standard @BBL A1',
      post_process: ['must-not-survive']
    })
    archive[settingsPath] = strToU8(JSON.stringify(settings))
    archive['Auxiliaries/source-note.txt'] = strToU8('must-not-survive')
    return Buffer.from(zipSync(archive))
  } finally { geometry.dispose() }
}

test('3MF profile tool inspects geometry and rebuilds a sanitized Kobra X QR Detail project', async () => {
  const source = await source3mf()
  const inspection = inspectProfile3mf(source, 'Bier Kisten.3mf')
  assert.equal(inspection.compatible, true)
  assert.equal(inspection.outputFilename, 'Bier Kisten_Anycubic-Kobra-X_QR-Detail.3mf')
  assert.deepEqual(inspection.model.size, [20, 18, 10])
  assert.deepEqual(inspection.model.colors, ['#d3c5a3'])
  assert.equal(inspection.model.objects, 1)
  assert.equal(inspection.model.plates, 1)

  const converted = await convertProfile3mf(source, 'Bier Kisten.3mf')
  const archive = unzipSync(converted.bytes)
  const settings = JSON.parse(strFromU8(archive['Metadata/project_settings.config']))
  assert.equal(settings.printer_settings_id, 'Anycubic Kobra X 0.4 nozzle')
  assert.equal(settings.printer_model, 'Anycubic Kobra X')
  assert.equal(settings.print_settings_id, 'Numa3D QR Plate Detail 0.12 @Anycubic Kobra X')
  assert.equal(settings.layer_height, '0.12')
  assert.equal(settings.wall_generator, 'arachne')
  assert.equal(settings.wall_loops, '2')
  assert.equal(settings.sparse_infill_density, '15%')
  assert.equal(settings.enable_support, '0')
  assert.deepEqual(settings.post_process, [])
  assert.equal(archive['Auxiliaries/source-note.txt'], undefined)
  assert.equal(converted.bytes.includes(Buffer.from('must-not-survive')), false)
  assert.deepEqual(inspectCustom3mf(converted.bytes).size, inspection.model.size)
  assert.deepEqual(inspectCustom3mf(converted.bytes).colors, inspection.model.colors)
})

test('3MF profile tool rejects unsafe inputs and multi-plate projects', async () => {
  assert.throws(() => inspectProfile3mf(Buffer.from('not a zip'), 'model.3mf'), /Format file 3MF/)
  assert.throws(() => inspectProfile3mf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'model.stl'), /format \.3mf/)

  const archive = unzipSync(await source3mf())
  const path = 'Metadata/model_settings.config'
  const xml = strFromU8(archive[path])
  const plate = xml.match(/<plate>[\s\S]*?<\/plate>/)?.[0]
  assert.ok(plate)
  archive[path] = strToU8(xml.replace('</config>', `${plate}</config>`))
  assert.throws(() => inspectProfile3mf(Buffer.from(zipSync(archive)), 'two-plates.3mf'), /multi-plate/)
})

test('3MF profile slicing maps inventory material and keeps QR Detail settings', async () => {
  const source = await source3mf()
  const prepared = await prepareSlicerInput(source, '3mf-profile', true, {
    sourceColors: ['#d3c5a3'],
    sourceMaterialIds: [7],
    materialIds: [7],
    slotMap: [0],
    colors: ['#101820']
  })
  assert.equal(prepared.format, '3mf')
  assert.deepEqual(prepared.settings.filament_colour, ['#101820'])
  assert.equal(prepared.settings.print_settings_id, 'Numa3D QR Plate Detail 0.12 @Anycubic Kobra X')
  assert.equal(prepared.settings.layer_height, '0.12')
  assert.equal(prepared.settings.wall_loops, '2')
  assert.equal(prepared.settings.enable_support, '0')
  assert.deepEqual(inspectCustom3mf(prepared.bytes).colors, ['#101820'])
})
