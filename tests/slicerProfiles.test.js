import test from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry } from 'three'
import { unzipSync, strFromU8 } from 'fflate'
import { TOOL_PRINT_PROFILES, slicerProjectSettings } from '../utils/slicerProjectSettings.js'
import { createPrintProjectExport } from '../utils/printProjectExport.js'
import { resolveGeneratorPartExport } from '../utils/generatorPartExport.js'

async function unpack(blob) {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  return { zip, settings: JSON.parse(strFromU8(zip['Metadata/project_settings.config'])) }
}

test('all tool profiles set every filament slot without overriding machine G-code or calibration', () => {
  for (const profile of Object.values(TOOL_PRINT_PROFILES)) {
    const settings = slicerProjectSettings(profile.id, 4)
    assert.match(settings.print_settings_id, new RegExp(profile.label))
    for (const key of ['filament_settings_id', 'filament_type', 'filament_diameter', 'nozzle_temperature', 'nozzle_temperature_initial_layer', 'textured_plate_temp', 'textured_plate_temp_initial_layer']) {
      assert.equal(settings[key].length, 4, key)
    }
    for (const key of ['machine_start_gcode', 'machine_end_gcode', 'filament_flow_ratio', 'pressure_advance', 'xy_hole_compensation', 'xy_contour_compensation']) {
      assert.equal(settings[key], undefined, key)
    }
  }
  assert.deepEqual(slicerProjectSettings(null, 2), {})
  assert.throws(() => slicerProjectSettings('unknown', 1), /tidak dikenal/)
  assert.throws(() => slicerProjectSettings(TOOL_PRINT_PROFILES.keychain.id, 0), /slot filament/)
})

test('switching profiles changes only settings and never reuses stale profile data', async () => {
  const geometry = new BoxGeometry(10, 10, 2)
  try {
    const export3mf = createPrintProjectExport([{ name: 'Base', parts: [{ geometry, color: '#ffffff' }] }], 'sample', TOOL_PRINT_PROFILES.keychain.id)
    const first = export3mf()
    const detailed = await unpack(first)
    const plain = await unpack(export3mf({ processPreset: null }))
    const clicker = await unpack(export3mf({ processPreset: TOOL_PRINT_PROFILES.clicker.id }))
    assert.equal(detailed.settings.layer_height, '0.12')
    assert.equal(detailed.settings.wall_loops, '3')
    assert.equal(plain.settings.layer_height, undefined)
    assert.equal(plain.settings.nozzle_temperature, undefined)
    assert.equal(plain.settings.printer_settings_id, 'Anycubic Kobra X 0.4 nozzle')
    assert.equal(clicker.settings.layer_height, '0.16')
    assert.equal(export3mf(), first)
    assert.deepEqual(plain.zip['3D/3dmodel.model'], detailed.zip['3D/3dmodel.model'])
    assert.deepEqual(plain.zip['Metadata/model_settings.config'], detailed.zip['Metadata/model_settings.config'])
    assert.throws(() => export3mf({ processPreset: 'bad' }), /tidak dikenal/)
    const model = { slug: 'sample', getBase3mfBlob: export3mf }
    const resolved = await resolveGeneratorPartExport(model, 'base', '3mf', { processPreset: null })
    assert.equal(resolved.blob, export3mf({ processPreset: null }))
  } finally { geometry.dispose() }
})
