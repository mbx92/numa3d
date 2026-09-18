import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanModelStem, isUuidFilename, libraryUploadForm } from '../utils/modelFilename.js'
import { displayLibraryFilename } from '../server/utils/modelFilename.js'

test('gallery display names ignore MinIO UUID object keys', () => {
  assert.equal(isUuidFilename('3f2a0c7b-9d14-4e2a-8b11-0c9a1f6e2b44.3mf'), true)
  assert.equal(isUuidFilename('3f2a0c7b9d144e2a8b110c9a1f6e2b44.stl'), true)
  assert.equal(isUuidFilename('keychain_ab_base_color.3mf'), false)
  assert.equal(displayLibraryFilename({
    requested: 'Keychain AB_base_color.3mf',
    multipartName: '3f2a0c7b-9d14-4e2a-8b11-0c9a1f6e2b44.3mf',
    objectKey: 'library/3f2a0c7b-9d14-4e2a-8b11-0c9a1f6e2b44.3mf'
  }), 'Keychain AB_base_color.3mf')
  assert.equal(displayLibraryFilename({
    multipartName: '3f2a0c7b-9d14-4e2a-8b11-0c9a1f6e2b44.3mf',
    objectKey: 'library/3f2a0c7b-9d14-4e2a-8b11-0c9a1f6e2b44.3mf'
  }), 'model.3mf')
  assert.equal(cleanModelStem('qr_plate.3mf'), 'qr_plate')
})

test('library upload form sends the human filename separately from the file part', () => {
  const body = libraryUploadForm(new Blob(['x']), 'clicker_ab_lid_color.3mf', 'model/3mf')
  assert.equal(body.get('filename'), 'clicker_ab_lid_color.3mf')
  assert.equal(body.get('file')?.name, 'clicker_ab_lid_color.3mf')
})
