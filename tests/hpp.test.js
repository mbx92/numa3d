import test from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry } from 'three'
import {
  computeHpp,
  recordedOrLiveHpp,
  roundPriceUp,
  sellingPriceFrom,
  suggestedPrettyPrice,
  suggestedPrice
} from '../utils/hpp.js'
import {
  estimateMaterialLines,
  geometryVolumeMm3,
  gramsFromVolumeMm3,
  mergeGeneratorRecipe
} from '../utils/meshHppEstimate.js'

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

test('kotak 10 mm = 1 cm3 → 1.24 g pada infill 100%', () => {
  const geo = new BoxGeometry(10, 10, 10)
  const volume = geometryVolumeMm3(geo)
  assert.ok(Math.abs(volume - 1000) < 0.01, `volume ${volume}`)
  assert.ok(Math.abs(gramsFromVolumeMm3(volume, { density: 1.24, infillPercent: 100, wastePercent: 0 }) - 1.24) < 0.001)
  geo.dispose()
})

test('estimasi menggabung part sewarna dan melewati hex tanpa material', () => {
  const geo = new BoxGeometry(10, 10, 10)
  const materials = [{ id: 7, name: 'PLA Hitam', type: 'filament', unit: 'gram', pricePerUnit: 150 }]
  const { lines, skipped } = estimateMaterialLines(
    [
      { geometry: geo, color: '#111111', role: 'base' },
      { geometry: geo, color: '#111111', role: 'lid' },
      { geometry: geo, color: '#ff0000', role: 'text' }
    ],
    {
      colorFields: [
        { key: 'base' },
        { key: 'lid' },
        { key: 'text' }
      ],
      materialIds: { base: 7, lid: 7 },
      colors: { base: '#111111', lid: '#111111', text: '#ff0000' },
      materials,
      infillPercent: 100,
      wastePercent: 0
    }
  )
  assert.equal(lines.length, 1)
  assert.equal(lines[0].materialId, 7)
  assert.ok(Math.abs(lines[0].quantityUsed - 2.5) < 0.05)
  assert.ok(skipped.includes('text'))
  geo.dispose()
})

test('merge recipe mengganti filament, mempertahankan part dan packaging', () => {
  const merged = mergeGeneratorRecipe({
    existingRecipes: [
      { materialId: 1, quantityUsed: 40, printTimeMinutes: 25, machineId: 2, failureRatePercent: 8, laborMinutes: 10, laborRatePerHour: 15000 },
      { materialId: 9, quantityUsed: 1, printTimeMinutes: 0, machineId: null, failureRatePercent: 0, laborMinutes: 0, laborRatePerHour: 0 }
    ],
    existingPackaging: [{ packagingId: 3, quantityUsed: 1 }],
    estimateLines: [{ materialId: 4, quantityUsed: 12.3, type: 'filament' }],
    materials: [
      { id: 1, type: 'filament' },
      { id: 4, type: 'filament' },
      { id: 9, type: 'part' }
    ],
    machineId: 2
  })
  assert.equal(merged.packaging[0].packagingId, 3)
  assert.equal(merged.recipes.length, 2)
  assert.equal(merged.recipes[0].materialId, 4)
  assert.equal(merged.recipes[0].quantityUsed, 12.3)
  assert.equal(merged.recipes[0].printTimeMinutes, 25)
  assert.equal(merged.recipes[1].materialId, 9)
})
