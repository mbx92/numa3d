import test from 'node:test'
import assert from 'node:assert/strict'
import { fillMissingToolMaterials } from '../utils/toolMaterialDefaults.js'

const fields = [
  { key: 'base', label: 'Base', materialType: 'filament' },
  { key: 'detail', label: 'Detail', materialType: 'filament' }
]

const materials = [
  { id: 1, name: 'Merah', type: 'filament', color: '#ff0000' },
  { id: 2, name: 'Biru', type: 'filament', color: '#0000ff' },
  { id: 3, name: 'Switch', type: 'part', color: '#111111' }
]

test('generator otomatis memilih material berwarna yang berbeda untuk field kosong', () => {
  const result = fillMissingToolMaterials({ fields, materials, random: () => 0 })
  assert.deepEqual(result.materialIds, { base: 1, detail: 2 })
  assert.deepEqual(result.colors, { base: '#ff0000', detail: '#0000ff' })
  assert.equal(result.changed, true)
})

test('pilihan material pengguna dipertahankan dan hanya field kosong yang diisi', () => {
  const result = fillMissingToolMaterials({
    fields,
    materials,
    materialIds: { base: 2 },
    colors: { base: '#abcdef' },
    random: () => 0
  })
  assert.deepEqual(result.materialIds, { base: 2, detail: 1 })
  assert.deepEqual(result.colors, { base: '#abcdef', detail: '#ff0000' })
})

test('material dengan tipe yang tidak sesuai tidak dipakai sebagai default', () => {
  const result = fillMissingToolMaterials({
    fields: [{ key: 'switch', materialType: 'part' }],
    materials,
    random: () => 0
  })
  assert.deepEqual(result.materialIds, { switch: 3 })
  assert.deepEqual(result.colors, { switch: '#111111' })
})
