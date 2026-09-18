import test from 'node:test'
import assert from 'node:assert/strict'
import { machineBuildVolume, modelFitsBuildVolume, printFileUsesZUp } from '../utils/printBed.js'

test('machineBuildVolume normalizes machine dimensions and defaults', () => {
  assert.deepEqual(machineBuildVolume({ bedWidthMm: 260, bedDepthMm: 250, buildHeightMm: 300 }), {
    width: 260,
    depth: 250,
    height: 300
  })
  assert.deepEqual(machineBuildVolume({}), { width: 220, depth: 220, height: 250 })
})

test('modelFitsBuildVolume checks centered bed footprint and build height', () => {
  const volume = { width: 220, depth: 220, height: 250 }
  assert.equal(modelFitsBuildVolume({ min: { x: -100, y: 0, z: -100 }, max: { x: 100, y: 40, z: 100 } }, volume), true)
  assert.equal(modelFitsBuildVolume({ min: { x: -111, y: 0, z: -100 }, max: { x: 100, y: 40, z: 100 } }, volume), false)
  assert.equal(modelFitsBuildVolume({ min: { x: -100, y: 0, z: -100 }, max: { x: 100, y: 251, z: 100 } }, volume), false)
})

test('printFileUsesZUp only rotates print-oriented mesh formats', () => {
  assert.equal(printFileUsesZUp('model.3mf'), true)
  assert.equal(printFileUsesZUp('part.STL'), true)
  assert.equal(printFileUsesZUp('mesh.obj'), true)
  assert.equal(printFileUsesZUp('scene.glb'), false)
  assert.equal(printFileUsesZUp('scene.gltf'), false)
})
