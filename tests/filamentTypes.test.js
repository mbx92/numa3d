import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeClientFilamentTypeName, filamentFilterTabs, filterFilamentMaterials } from '../utils/filamentTypes.js'

test('filament names accept custom types and reject empty or oversized input', () => {
  assert.equal(normalizeClientFilamentTypeName('  PLA   Silk  '), 'PLA Silk')
  assert.equal(normalizeClientFilamentTypeName('PETG-CF'), 'PETG-CF')
  for (const name of ['', '  ', null, {}, 'x'.repeat(61), 'PLA\u0000']) assert.throws(() => normalizeClientFilamentTypeName(name))
})

test('dynamic filters preserve unassigned legacy materials and distinguish matching colors by type', () => {
  const types = [{ id: 1, name: 'PLA' }, { id: 2, name: 'PETG' }]
  const materials = [
    { id: 10, type: 'filament', color: '#ffffff', filamentTypeId: 1 },
    { id: 11, type: 'filament', color: '#ffffff', filamentTypeId: 2 },
    { id: 12, type: 'filament', filamentTypeId: null }
  ]
  assert.equal(filterFilamentMaterials(materials, 'all').length, 3)
  assert.deepEqual(filterFilamentMaterials(materials, '1').map((m) => m.id), [10])
  assert.deepEqual(filterFilamentMaterials(materials, 'unassigned').map((m) => m.id), [12])
  assert.deepEqual(filamentFilterTabs(types, materials).map((t) => [t.label, t.count]), [['Semua', 3], ['PLA', 1], ['PETG', 1], ['Belum diatur', 1]])
  types.push({ id: 3, name: 'PLA Silk' })
  assert.deepEqual(filamentFilterTabs(types, materials).find((t) => t.id === '3'), { id: '3', label: 'PLA Silk', count: 0 })
  types[0].name = 'PLA+'
  assert.equal(filamentFilterTabs(types, materials)[1].label, 'PLA+')
  assert.deepEqual(filterFilamentMaterials([{ id: 13, type: 'resin' }], 'unassigned'), [])
})
