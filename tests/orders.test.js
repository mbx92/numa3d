import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveOrderStatus, parseOrderBody } from '../server/utils/orders.js'

test('order siap ketika seluruh jumlah sudah direservasi', () => {
  assert.equal(deriveOrderStatus({ quantity: 3, quantityReserved: 3 }), 'ready')
  assert.equal(deriveOrderStatus({ quantity: 3, quantityReserved: 2 }), 'confirmed')
})

test('status produksi mengikuti job aktif sebelum jumlah reservasi', () => {
  assert.equal(
    deriveOrderStatus({ quantity: 3, quantityReserved: 3, jobs: [{ status: 'queued' }] }),
    'confirmed'
  )
  assert.equal(
    deriveOrderStatus({ quantity: 3, quantityReserved: 1, jobs: [{ status: 'in_progress' }] }),
    'in_production'
  )
})

test('payload order dinormalisasi menjadi satu item produk', () => {
  const parsed = parseOrderBody({
    date: '2026-09-17',
    customerName: '  Budi  ',
    channel: 'whatsapp',
    productId: '12',
    quantity: '2.4',
    pricePerUnit: '15000',
    notes: '  kirim sore  '
  })
  assert.deepEqual(parsed, {
    order: {
      date: '2026-09-17',
      customerName: 'Budi',
      channel: 'whatsapp',
      notes: 'kirim sore'
    },
    item: { productId: 12, quantity: 2, pricePerUnit: 15000 }
  })
})
