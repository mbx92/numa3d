import test from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry, Mesh } from 'three'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { validateStl } from '../server/utils/stl.js'
import { validateSlicerUpload } from '../server/utils/slicerQueue.js'
import { prepareSlicerInput } from '../server/utils/orcaSlicer.js'
import { customOrderSliceValues, sliceMaterialUsage } from '../server/utils/customOrderSlicing.js'
import { customOrderHppFromForm } from '../utils/hpp.js'

function box(binary = false, width = 20) {
  const geometry = new BoxGeometry(width, 20, 10)
  try {
    const data = new STLExporter().parse(new Mesh(geometry), { binary })
    return typeof data === 'string' ? Buffer.from(data) : Buffer.from(data.buffer)
  } finally { geometry.dispose() }
}

test('custom slicing accepts ASCII and binary STL with one filament and no prime tower', async () => {
  for (const binary of [false, true]) {
    const bytes = box(binary)
    assert.deepEqual(validateStl(bytes), { triangles: 12, size: [20, 20, 10] })
    const upload = validateSlicerUpload({ file: bytes, filename: 'box.stl', tool: 'custom-order', includeProfile: true })
    assert.equal(upload.includeProfile, false)
    const prepared = await prepareSlicerInput(bytes, 'custom-order')
    assert.deepEqual(prepared.settings.filament_colour, ['#FFFFFF'])
    assert.equal(prepared.settings.enable_prime_tower, '0')
    assert.deepEqual(prepared.settings.post_process, [])
    assert.deepEqual(prepared.bytes, bytes)
  }
})

test('custom slicing rejects another format, truncated or malformed meshes, nonfinite coordinates and oversize models', () => {
  assert.throws(() => validateSlicerUpload({ file: box(), filename: 'box.obj', tool: 'custom-order' }), /hanya menerima file STL atau 3MF/)
  assert.throws(() => validateSlicerUpload({ file: box(), filename: 'box.3mf', tool: 'custom-order' }), /Format file 3MF/)
  assert.throws(() => validateStl(Buffer.from('not an STL')), /Format/)
  assert.throws(() => validateStl(box(true).subarray(0, 100)), /Format/)
  assert.throws(() => validateStl(Buffer.from(box().toString().replace('endfacet', 'badfacet'))), /Mesh/)
  const invalid = box(true)
  invalid.writeFloatLE(Infinity, 96)
  assert.throws(() => validateStl(invalid), /Koordinat/)
  assert.throws(() => validateStl(box(true, 261)), /area cetak/)
})

const auth = { id: 7, role: 'staff' }
const completed = {
  id: 9, userId: 7, tool: 'custom-order', status: 'completed', filename: 'box.stl',
  result: { totalGrams: 2.02, printTimeSeconds: 577, filamentGrams: [2.02], colors: ['#FFFFFF'], filamentChanges: 0, primeTower: false }
}

test('custom HPP uses the completed job statistics per unit and one material', () => {
  const values = customOrderSliceValues(completed, auth)
  assert.equal(values.materialQuantityUsed, 2.02)
  assert.equal(values.printTimeMinutes, 10)
  assert.equal(values.slicerResult.jobId, 9)
  const catalog = { materials: [{ id: 8, name: 'PLA White', unit: 'gram', pricePerUnit: 200 }] }
  const form = { ...values, materialId: 8, quantity: 3, failureRatePercent: 5 }
  const hpp = customOrderHppFromForm(form, catalog, {})
  assert.equal(hpp.breakdown.materialCost, 404)
  assert.equal(hpp.total, 424)
  assert.equal(customOrderHppFromForm({ ...form, quantity: 1 }, catalog, {}).total, hpp.total)
})

test('custom orders require a completed owned STL job and reject multi-color or invalid statistics', () => {
  assert.throws(() => customOrderSliceValues(null, auth), /tidak ditemukan/)
  assert.throws(() => customOrderSliceValues({ ...completed, userId: 8 }, auth), /diakses/)
  assert.doesNotThrow(() => customOrderSliceValues({ ...completed, userId: 8 }, { role: 'admin', id: 7 }))
  for (const change of [{ status: 'queued' }, { status: 'failed' }, { status: 'cancelled' }, { tool: 'keychain' }]) {
    assert.throws(() => customOrderSliceValues({ ...completed, ...change }, auth), /selesaikan slicing/)
  }
  for (const change of [{ colors: ['#FFFFFF', '#000000'] }, { filamentGrams: [1, 1.02] }, { primeTower: true }, { filamentChanges: 1 }]) {
    assert.throws(() => customOrderSliceValues({ ...completed, result: { ...completed.result, ...change } }, auth), /satu warna/)
  }
  for (const change of [{ totalGrams: NaN }, { totalGrams: 0 }, { printTimeSeconds: -1 }]) {
    assert.throws(() => customOrderSliceValues({ ...completed, result: { ...completed.result, ...change } }, auth), /Statistik/)
  }
})

test('3MF HPP sums material costs and charges machine/labor once, including rounded slot totals', () => {
  const job = { ...completed, filename: 'two.3mf', inputConfig: { materialIds: [8, 9] }, result: { ...completed.result, inputFormat: '3mf', totalGrams: 10.01, filamentGrams: [4, 6], colors: ['#ffffff', '#000000'], primeTower: true, filamentChanges: 4 } }
  const values = customOrderSliceValues(job, auth)
  const materialUsage = sliceMaterialUsage(job)
  assert.equal(materialUsage.reduce((a, b) => a + b.quantityUsed, 0), 10.01)
  const catalog = { materials: [{ id: 8, pricePerUnit: 200 }, { id: 9, pricePerUnit: 300 }], machines: [{ id: 1, powerWatt: 1000 }] }
  const result = customOrderHppFromForm({ ...values, materialUsage, machineId: 1, failureRatePercent: 0, laborMinutes: 60, laborRatePerHour: 1000 }, catalog, { electricityRatePerKwh: 600 })
  assert.equal(result.breakdown.materialCost, 2603)
  assert.equal(result.breakdown.electricityCost, 100)
  assert.equal(result.breakdown.laborCost, 1000)
})
