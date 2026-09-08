import test from 'node:test'
import assert from 'node:assert/strict'
import { createGeneratorWorkerClient, GeneratorWorkerError } from '../utils/generatorWorkerClient.js'

class FakeWorker {
  listeners = new Map()
  messages = []
  terminated = false
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener) }
  emit(type, event) { for (const listener of this.listeners.get(type) || []) listener(event) }
  reply(data) { this.emit('message', { data }) }
  postMessage(message, transfer) {
    if (this.postError) throw this.postError
    this.messages.push({ ...message, transfer })
  }
  terminate() { this.terminated = true }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0) }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
function fixture(options) {
  const workers = []
  const client = createGeneratorWorkerClient(() => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  }, options)
  return { workers, client }
}

test('routes concurrent responses by id and deduplicates transfer buffers', async () => {
  const { workers, client } = fixture()
  const buffer = new ArrayBuffer(8)
  const first = client.run({ text: 'A' }, [buffer, buffer])
  const second = client.run({ text: 'B' })
  await flush()
  const worker = workers[0]
  assert.equal(workers.length, 1)
  assert.deepEqual(worker.messages[0].transfer, [buffer])
  worker.reply({ id: -1, result: 'unrelated' })
  worker.reply({ id: worker.messages[1].id, result: 'B' })
  worker.reply({ id: worker.messages[0].id, result: 'A' })
  assert.deepEqual(await Promise.all([first, second]), ['A', 'B'])
})

test('a design error rejects only its request and keeps the worker usable', async () => {
  const { workers, client } = fixture()
  const bad = client.run({ text: '' })
  await flush()
  workers[0].reply({ id: workers[0].messages[0].id, error: 'Teks wajib diisi' })
  await assert.rejects(bad, (error) => !(error instanceof GeneratorWorkerError) && /Teks/.test(error.message))
  const good = client.run({ text: 'B' })
  await flush()
  workers[0].reply({ id: workers[0].messages[1].id, result: 'ok' })
  assert.equal(await good, 'ok')
  assert.equal(workers.length, 1)
})

for (const type of ['error', 'messageerror']) {
  test(`${type} settles all pending requests, cleans listeners, and allows a fresh worker`, async () => {
    const { workers, client } = fixture()
    const jobs = [client.run({}), client.run({})]
    const rejected = jobs.map((job) => assert.rejects(job, GeneratorWorkerError))
    await flush()
    workers[0].emit(type, { message: 'WASM crashed' })
    await Promise.all(rejected)
    assert.equal(workers[0].terminated, true)
    assert.equal(workers[0].listenerCount, 0)
    const retry = client.run({})
    await flush()
    workers[1].reply({ id: workers[1].messages[0].id, result: 42 })
    assert.equal(await retry, 42)
  })
}

test('postMessage clone errors settle immediately without leaving a request timer', async () => {
  const { workers, client } = fixture({ timeoutMs: 15 })
  const job = client.run({})
  workers[0].postError = new DOMException('Cannot clone', 'DataCloneError')
  await assert.rejects(job, { name: 'DataCloneError' })
  workers[0].postError = null
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(workers[0].terminated, false)
  const retry = client.run({})
  await flush()
  workers[0].reply({ id: workers[0].messages[0].id, result: 'ok' })
  assert.equal(await retry, 'ok')
})

test('a hung generation terminates the worker and rejects every queued request', async () => {
  const { workers, client } = fixture({ timeoutMs: 15 })
  await Promise.all([assert.rejects(client.run({}), /batas waktu/), assert.rejects(client.run({}), /batas waktu/)])
  assert.equal(workers[0].terminated, true)
  assert.equal(workers[0].listenerCount, 0)
})

test('initialization is shared and generation waits for initDone', async () => {
  let initCount = 0
  const { workers, client } = fixture({ initialize(worker) { initCount++; worker.postMessage({ type: 'init' }) } })
  const first = client.run({ text: 'A' })
  const second = client.run({ text: 'B' })
  await flush()
  assert.equal(initCount, 1)
  assert.equal(workers[0].messages.length, 1)
  workers[0].reply({ type: 'ready' })
  assert.equal(workers[0].messages.length, 1)
  workers[0].reply({ type: 'initDone' })
  await flush()
  for (const message of workers[0].messages.slice(1)) workers[0].reply({ id: message.id, result: message.opts.text })
  assert.deepEqual(await Promise.all([first, second]), ['A', 'B'])
})

test('initialization timeout aborts asset fetches and allows retry', async () => {
  const signals = []
  const { workers, client } = fixture({
    initTimeoutMs: 15,
    initialize(worker, signal) { signals.push(signal); return new Promise(() => {}) }
  })
  await assert.rejects(client.run({}), /Init worker timeout/)
  assert.equal(signals[0].aborted, true)
  assert.equal(workers[0].listenerCount, 0)
  const retry = client.run({})
  await flush()
  workers[1].reply({ type: 'initDone' })
  await flush()
  workers[1].reply({ id: workers[1].messages[0].id, result: 'recovered' })
  assert.equal(await retry, 'recovered')
})

test('asset failures and worker initialization errors settle callers', async () => {
  const brokenAsset = fixture({ initialize() { throw new Error('socket missing') } })
  await assert.rejects(brokenAsset.client.run({}), /socket missing/)
  assert.equal(brokenAsset.workers[0].terminated, true)
  const brokenWasm = fixture({ initialize(worker) { worker.reply({ type: 'error', message: 'WASM missing' }) } })
  await assert.rejects(brokenWasm.client.run({}), /WASM missing/)
  assert.equal(brokenWasm.workers[0].terminated, true)
})

test('worker construction can be retried after an infrastructure failure', async () => {
  const worker = new FakeWorker()
  let calls = 0
  const client = createGeneratorWorkerClient(() => {
    if (++calls === 1) throw new Error('Module unavailable')
    return worker
  })
  await assert.rejects(client.run({}), GeneratorWorkerError)
  const retry = client.run({})
  await flush()
  worker.reply({ id: worker.messages[0].id, result: 'ok' })
  assert.equal(await retry, 'ok')
})
