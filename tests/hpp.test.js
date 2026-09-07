import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeHpp,
  recordedOrLiveHpp,
  roundPriceUp,
  sellingPriceFrom,
  suggestedPrettyPrice,
  suggestedPrice
} from '../utils/hpp.js'

const settings = { electricityRatePerKwh: 1445, machineUsageHoursPerMonth: 100 }

test('HPP menjumlah material, buffer, listrik, depresiasi, kerja, packaging', () => {
  const hpp = computeHpp(
    [
      {
        materialId: 1,
        quantityUsed: 100,
        printTimeMinutes: 60,
        failureRatePercent: 10,
        laborMinutes: 30,
        laborRatePerHour: 20000,
        material: { name: 'PLA', unit: 'gram', pricePerUnit: 150 },
        machine: { powerWatt: 200, purchasePrice: 3600000, depreciationMonths: 36 }
      }
    ],
    [{ packagingId: 1, quantityUsed: 1, packaging: { name: 'Box', unit: 'pcs', pricePerUnit: 1500 } }],
    settings
  )
  assert.equal(hpp.breakdown.materialCost, 15000)
  assert.equal(hpp.breakdown.failureBuffer, 1500)
  assert.equal(hpp.breakdown.electricityCost, 289)
  assert.equal(hpp.breakdown.depreciationCost, 1000)
  assert.equal(hpp.breakdown.laborCost, 10000)
  assert.equal(hpp.breakdown.packagingCost, 1500)
  assert.equal(hpp.total, 29289)
})

test('harga saran adalah margin atas harga jual, lalu dibulatkan ke atas', () => {
  assert.equal(suggestedPrice(12000, 40), 20000)
  assert.equal(suggestedPrettyPrice(12000, 40, 500), 20000)
  assert.equal(roundPriceUp(20100, 500), 20500)
  assert.equal(suggestedPrice(0, 40), 0)
})

test('harga jual memakai list price jika ada, selain itu saran', () => {
  assert.equal(sellingPriceFrom({ hpp: 12000, listPrice: 25000, marginPercent: 40, hasRecipe: true }), 25000)
  assert.equal(sellingPriceFrom({ hpp: 12000, listPrice: 0, marginPercent: 40, hasRecipe: true }), 20000)
  assert.equal(sellingPriceFrom({ hpp: 12000, listPrice: 0, marginPercent: 40, hasRecipe: false }), 0)
})

test('laporan memakai HPP tercatat, fallback live untuk penjualan lama', () => {
  assert.equal(recordedOrLiveHpp(18000, 20000), 18000)
  assert.equal(recordedOrLiveHpp(null, 20000), 20000)
  assert.equal(recordedOrLiveHpp(0, 20000), 0)
})
