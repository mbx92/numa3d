import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSlicerUpload, mayManageSlicerJob, MAX_SLICER_FILE_BYTES } from '../server/utils/slicerQueue.js'

const valid3mf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

test('slicer queue accepts generator 3MF and sanitizes its filename', () => {
  const value = validateSlicerUpload({
    file: valid3mf, filename: '../model\r\n.3mf', tool: 'keychain', includeProfile: true
  })
  assert.equal(value.filename.includes('/'), false)
  assert.equal(value.filename.includes('\\'), false)
  assert.equal(value.tool, 'keychain')
  assert.equal(value.includeProfile, true)
})

test('slicer queue rejects unknown tools, non-3MF data and oversized input', () => {
  assert.throws(() => validateSlicerUpload({ file: valid3mf, tool: 'lightbox' }), /tidak didukung/)
  assert.throws(() => validateSlicerUpload({ file: Buffer.from('not a zip'), tool: 'keychain' }), /Format file/)
  assert.throws(() => validateSlicerUpload({ file: { length: MAX_SLICER_FILE_BYTES + 1 }, tool: 'keychain' }), /40 MB/)
})

test('only the job owner or an admin may manage a slicer job', () => {
  assert.equal(mayManageSlicerJob({ id: 7, role: 'staff' }, { userId: 7 }), true)
  assert.equal(mayManageSlicerJob({ id: 8, role: 'staff' }, { userId: 7 }), false)
  assert.equal(mayManageSlicerJob({ id: 8, role: 'admin' }, { userId: 7 }), true)
})
