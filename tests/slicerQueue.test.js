import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSlicerUpload, mayManageSlicerJob, MAX_SLICER_FILE_BYTES } from '../server/utils/slicerQueue.js'
import { normalizeSlicerRecipeConfig, productRecipeRowsFromSlice } from '../server/utils/slicerRecipe.js'

const valid3mf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

test('slicer queue accepts generator 3MF and sanitizes its filename', () => {
  const value = validateSlicerUpload({
    file: valid3mf, filename: '../model\r\n.3mf', tool: 'keychain', includeProfile: true
  })
  assert.equal(value.filename.includes('/'), false)
  assert.equal(value.filename.includes('\\'), false)
  assert.equal(value.tool, 'keychain')
  assert.equal(value.includeProfile, true)
  const profile = validateSlicerUpload({
    file: valid3mf, filename: '../makerworld.3mf', tool: '3mf-profile', includeProfile: false
  })
  assert.equal(profile.tool, '3mf-profile')
  assert.equal(profile.format, '3mf')
  assert.equal(profile.filename, '.._makerworld.3mf')
  assert.equal(profile.includeProfile, true)
})

test('slicer queue rejects unknown tools, non-3MF data and oversized input', () => {
  assert.throws(() => validateSlicerUpload({ file: valid3mf, tool: 'lightbox' }), /tidak didukung/)
  assert.throws(() => validateSlicerUpload({ file: Buffer.from('not a zip'), tool: 'keychain' }), /Format file/)
  assert.throws(() => validateSlicerUpload({ file: valid3mf, filename: 'model.stl', tool: '3mf-profile' }), /hanya menerima file 3MF/)
  assert.throws(() => validateSlicerUpload({ file: { length: MAX_SLICER_FILE_BYTES + 1 }, tool: 'keychain' }), /40 MB/)
})

test('only the job owner or an admin may manage a slicer job', () => {
  assert.equal(mayManageSlicerJob({ id: 7, role: 'staff' }, { userId: 7 }), true)
  assert.equal(mayManageSlicerJob({ id: 8, role: 'staff' }, { userId: 7 }), false)
  assert.equal(mayManageSlicerJob({ id: 8, role: 'admin' }, { userId: 7 }), true)
})

test('product slicing accepts STL / 3MF and converts Orca statistics into recipe rows', () => {
  const upload = validateSlicerUpload({ file: valid3mf, filename: 'produk.3mf', tool: 'product' })
  assert.equal(upload.tool, 'product')
  assert.equal(upload.includeProfile, false)
  const config = normalizeSlicerRecipeConfig({ machineId: '3', failureRatePercent: '7.5', laborMinutes: '12', laborRatePerHour: '25000' })
  assert.deepEqual(config, { machineId: 3, failureRatePercent: 7.5, laborMinutes: 12, laborRatePerHour: 25000 })
  const rows = productRecipeRowsFromSlice({
    materialIds: [8, 9], filamentGrams: [4, 6], totalGrams: 11, printTimeSeconds: 601
  }, config)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].quantityUsed, 4.4)
  assert.equal(rows[1].quantityUsed, 6.6)
  assert.equal(rows[0].printTimeMinutes, 11)
  assert.equal(rows[0].machineId, 3)
  assert.equal(rows[1].machineId, null)
  assert.equal(rows[0].failureRatePercent, 7.5)
})

test('product recipe conversion rejects invalid Orca statistics and process values', () => {
  assert.throws(() => normalizeSlicerRecipeConfig({ failureRatePercent: 101 }), /0–100/)
  assert.throws(() => productRecipeRowsFromSlice({ materialIds: [1], filamentGrams: [], totalGrams: 1, printTimeSeconds: 1 }), /material Orca/)
  assert.throws(() => productRecipeRowsFromSlice({ materialIds: [1], filamentGrams: [0], totalGrams: 1, printTimeSeconds: 1 }), /Berat filament/)
})
