import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, reactive, shallowRef } from 'vue'
import { useGeneratorState } from '../composables/useGeneratorState.js'

function fixture(t) {
  const scope = effectScope()
  t.after(() => scope.stop())
  const form = reactive({ text: 'A', colors: { base: '#fff' }, meshBuffer: new ArrayBuffer(8) })
  const result = shallowRef(null)
  const jobs = []
  const state = scope.run(() => useGeneratorState(form, result, () => {
    const revision = state.revision.value
    return new Promise((resolve) => jobs.push({
      finish() { result.value = { text: form.text }; state.markGenerated(revision); resolve() },
      fail() { result.value = null; resolve() }
    }))
  }))
  return { scope, form, result, state, jobs }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

test('exports wait for the current job instead of generating the same model twice', async (t) => {
  const { state, jobs } = fixture(t)
  const generate = state.runGenerate()
  const exports = [state.ensureFreshResult(), state.ensureFreshResult()]
  await flush()
  assert.equal(jobs.length, 1)
  jobs[0].finish()
  await generate
  assert.deepEqual(await Promise.all(exports), [true, true])
})

test('nested edits and replacement buffers invalidate a result and export regenerates', async (t) => {
  const { state, form, jobs } = fixture(t)
  const initial = state.runGenerate()
  await flush(); jobs[0].finish(); await initial
  assert.equal(state.isFresh.value, true)
  form.colors.base = '#123456'
  assert.equal(state.isFresh.value, false)
  const exported = state.ensureFreshResult()
  await flush(); jobs[1].finish()
  assert.equal(await exported, true)
  form.meshBuffer = new ArrayBuffer(8)
  assert.equal(state.isFresh.value, false)
})

test('editing while generation runs requires a new result before exporting', async (t) => {
  const { state, form, jobs } = fixture(t)
  const generate = state.runGenerate()
  await flush()
  form.text = 'B'
  const exported = state.ensureFreshResult()
  jobs[0].finish(); await generate; await flush()
  assert.equal(state.isFresh.value, false)
  assert.equal(jobs.length, 2)
  jobs[1].finish()
  assert.equal(await exported, true)
})

test('a failed refresh never authorizes an export', async (t) => {
  const { state, jobs } = fixture(t)
  const exported = state.ensureFreshResult()
  await flush(); jobs[0].fail()
  assert.equal(await exported, false)
})

test('scope disposal stops export and prevents new generation', async (t) => {
  const { state, jobs, scope } = fixture(t)
  const exported = state.ensureFreshResult()
  await flush(); scope.stop(); jobs[0].finish()
  assert.equal(await exported, false)
  await state.runGenerate()
  assert.equal(jobs.length, 1)
})

test('restarting the wizard permits a new request even with unchanged input', async (t) => {
  const { state, jobs } = fixture(t)
  const old = state.runGenerate()
  await flush(); state.invalidate()
  const fresh = state.runGenerate()
  await flush()
  assert.equal(jobs.length, 2)
  jobs[0].fail(); jobs[1].finish()
  await Promise.all([old, fresh])
  assert.equal(await state.ensureFreshResult(), true)
})
