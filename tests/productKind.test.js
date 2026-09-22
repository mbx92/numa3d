import test from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCT_KINDS, normalizeProductKind, productKindLabel } from '../shared/utils/productKind.js'

test('product categories cover normal, custom, and collection with a safe default', () => {
  assert.deepEqual(PRODUCT_KINDS, ['normal', 'custom', 'collection'])
  assert.equal(normalizeProductKind('custom'), 'custom')
  assert.equal(normalizeProductKind('unknown'), 'normal')
  assert.equal(productKindLabel.collection, 'Koleksi kita')
})
