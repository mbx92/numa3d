import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({ resolve(s, c, next) { return next(s === 'opentype.js' ? 'opentype.js/dist/opentype.mjs' : s, c) } })
const { generateQrPlate, disposeQrPlateWorker } = await import('../utils/qrPlateGenerator.js')

class FakeWorker {
  static instances = []
  listeners = new Map()
  terminated = false
  constructor() { FakeWorker.instances.push(this) }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(fn)
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
  postMessage(data) { this.request = data }
  terminate() { this.terminated = true }
  emit(type, data) { for (const fn of [...this.listeners.get(type) || []]) fn(data) }
}
const previousWorker = globalThis.Worker
test.beforeEach(() => { FakeWorker.instances = []; globalThis.Worker = FakeWorker })
test.afterEach(() => { disposeQrPlateWorker(); globalThis.Worker = previousWorker })

test('editing a running QR plate stops stale WASM work instead of queuing behind it', async () => {
  const first = generateQrPlate({})
  const rejected = assert.rejects(first, { name: 'AbortError' })
  const controller = new AbortController()
  const next = generateQrPlate({ headerLogoSizeMm: 28 }, { signal: controller.signal })
  const canceled = assert.rejects(next, { name: 'AbortError' })
  await rejected
  assert.equal(FakeWorker.instances.length, 2)
  assert.equal(FakeWorker.instances[0].terminated, true)
  assert.equal(FakeWorker.instances[1].terminated, false)
  controller.abort()
  await canceled
  assert.equal(FakeWorker.instances[1].terminated, true)
  for (const worker of FakeWorker.instances) for (const listeners of worker.listeners.values()) assert.equal(listeners.size, 0)
})

test('worker errors and disposal settle pending generation immediately', async () => {
  const job = generateQrPlate({})
  const rejected = assert.rejects(job, /WASM failed/)
  FakeWorker.instances[0].emit('error', { message: 'WASM failed' })
  await rejected
  const retry = generateQrPlate({})
  const disposed = assert.rejects(retry, { name: 'AbortError' })
  disposeQrPlateWorker()
  await disposed
  assert.equal(FakeWorker.instances[1].terminated, true)
})
