import test from 'node:test'
import assert from 'node:assert/strict'
import Module from 'manifold-3d'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'
import { compileCodeStudio, CODE_LIMITS } from '../utils/codeStudioLanguage.js'
import { buildCodeStudio } from '../utils/codeStudioEngine.js'
import { buildCodeStudioResult } from '../utils/codeStudioGenerator.js'
import { CODE_STUDIO_EXAMPLES } from '../utils/codeStudioExamples.js'
import { runCodeStudioJob } from '../utils/codeStudioJob.js'

test('language supports the advertised syntax, arithmetic precedence, parameters and comments', () => {
  const parsed = compileCodeStudio(`/* dimensions */
const width = param("width", 60, { min: 20, max: 180 });
const body = box(width, 2 + 3 * 4, 8);
const hole = cylinder({ radius: 3, height: 12 });
return subtract(body, hole); // finish`, { width: 80 })
  assert.equal(parsed.root.op, 'subtract')
  assert.deepEqual(parsed.root.args[0].args, [80, 14, 8])
  assert.equal(parsed.parameters[0].value, 80)
  assert.equal(compileCodeStudio('return box(20 / 2 / 2, 1, 1)').root.args[0], 5)
})

test('rejects executable JavaScript, global/property access, prototype keys and forged solids', () => {
  for (const source of [
    'return fetch("/api/auth/me")', 'return eval("alert(1)")', 'return Function("return this")()',
    'return window', 'return self', 'return globalThis', 'return document.cookie',
    'import x from "x"; return box(1,1,1)', 'while(1) {}', 'return (() => box(1,1,1))()',
    'return box.constructor("return self")()', 'return box["constructor"]("x")',
    'return cylinder({constructor: 1})', 'return cylinder({__proto__: {height:1}})',
    'const x = {op: "box", args: [1,1,1]}; return x', 'return box(1,1,1); fetch("/api")',
    'return this', 'return new Worker("x")', 'return `template`'
  ]) assert.throws(() => compileCodeStudio(source), /Baris/, source)
})

test('bounds source size, nesting, node/repeat complexity and invalid numeric input', () => {
  assert.throws(() => compileCodeStudio(' '.repeat(CODE_LIMITS.source + 1)), /16.000/)
  for (const source of [
    'return box(1/0,1,1)', 'return box(-1,1,1)', 'return box(1001,1,1)',
    'return cylinder({radius:2,height:5,segments:10000})', 'return sphere(1e999)',
    'return repeat(box(1,1,1),33,[1,0,0])', 'return scale(box(1,1,1),[0,1,1])',
    'return repeat(repeat(box(1,1,1),32,[2,0,0]),32,[0,2,0])',
    'return ' + '('.repeat(60) + 'box(1,1,1)' + ')'.repeat(60),
    'const a = box(1,1,1); const a = box(2,2,2); return a'
  ]) assert.throws(() => compileCodeStudio(source), /Baris/, source)
  const example = CODE_STUDIO_EXAMPLES[0].code
  assert.throws(() => compileCodeStudio(example, { width: NaN }), /Angka/)
  assert.throws(() => compileCodeStudio(example, { width: '60' }), /Angka/)
  assert.throws(() => compileCodeStudio(example, { width: 500 }), /Angka/)
  assert.throws(() => compileCodeStudio('const a = box(1,1,1);\nreturn nope'), /Baris 2/)
})

test('real Manifold examples produce grounded, printable geometry and valid exports', async () => {
  const wasm = await Module(); wasm.setup()
  for (const example of CODE_STUDIO_EXAMPLES) {
    const raw = buildCodeStudio(wasm, example.code)
    assert.ok(raw.volumeMm3 > 0)
    assert.ok(raw.triangles > 12)
    const z = raw.geometry.positions.filter((_, i) => i % 3 === 2)
    assert.ok(Math.abs(Math.min(...z)) < 0.0001)
    const result = buildCodeStudioResult(raw, { label: example.name, color: '#123456' })
    try {
      const stl = await result.getBaseBlob().arrayBuffer()
      assert.equal(stl.byteLength, 84 + 50 * raw.triangles)
      assert.equal(new DataView(stl).getUint32(80, true), raw.triangles)
      const zip = unzipSync(new Uint8Array(await result.getPlate3mfBlob().arrayBuffer()))
      assert.match(strFromU8(zip['3D/3dmodel.model']), /unit="millimeter"/)
      const settings = JSON.parse(strFromU8(zip['Metadata/project_settings.config']))
      assert.deepEqual(settings.filament_colour, ['#123456'])
      assert.equal(result.baseExportParts[0].role, 'base')
    } finally { result.dispose() }
    assert.throws(() => result.getBaseBlob(), /dibuang/)
  }
})

test('booleans/transforms match analytic volume and empty/oversized results are rejected', async () => {
  const wasm = await Module(); wasm.setup()
  const cases = [
    ['return box(10,20,5)', 1000],
    ['return subtract(box(10,10,10),box(5,5,5))', 875],
    ['return intersect(box(10,10,10),box(5,5,5))', 125],
    ['return union(box(10,10,10),translate(box(10,10,10),[10,0,0]))', 2000],
    ['return rotate(scale(box(10,10,10),[2,1,1]),[0,0,90])', 2000],
    ['return repeat(box(1,1,1),3,[2,0,0])', 3]
  ]
  for (const [code, volume] of cases) assert.ok(Math.abs(buildCodeStudio(wasm, code).volumeMm3 - volume) < 0.0001)
  assert.throws(() => buildCodeStudio(wasm, 'return subtract(box(1,1,1),box(2,2,2))'), /kosong/)
  assert.throws(() => buildCodeStudio(wasm, 'return scale(box(100,100,100),[20,1,1])'), /batas ukuran/)
  const big = buildCodeStudioResult(buildCodeStudio(wasm, 'return box(300,300,10)'))
  try { assert.throws(() => big.getPlate3mfBlob(), /tidak muat/) } finally { big.dispose() }
  // Failed jobs must not poison the kernel.
  assert.equal(buildCodeStudio(wasm, 'return box(1,1,1)').volumeMm3, 1)
})

class FakeWorker {
  events = new Map()
  terminated = false
  addEventListener(type, fn) { this.events.set(type, fn) }
  removeEventListener(type) { this.events.delete(type) }
  postMessage(payload) { this.payload = payload }
  terminate() { this.terminated = true }
}
test('one-shot worker terminates on success, cancellation, timeout and runtime errors', async () => {
  const worker = new FakeWorker()
  const success = runCodeStudioJob(() => worker, { source: 'return box(1,1,1)' })
  worker.events.get('message')({ data: { result: { triangles: 12 } } })
  assert.equal((await success).triangles, 12)
  assert.equal(worker.terminated, true)
  assert.equal(worker.events.size, 0)
  const cancelled = new FakeWorker()
  const controller = new AbortController()
  const job = runCodeStudioJob(() => cancelled, {}, { signal: controller.signal })
  controller.abort()
  await assert.rejects(job, { name: 'AbortError' })
  assert.equal(cancelled.terminated, true)
  const timedOut = new FakeWorker()
  await assert.rejects(runCodeStudioJob(() => timedOut, {}, { timeoutMs: 5 }), /30 detik/)
  assert.equal(timedOut.terminated, true)
  const failed = new FakeWorker()
  const failure = runCodeStudioJob(() => failed, {})
  failed.events.get('error')({ message: 'WASM failed' })
  await assert.rejects(failure, /WASM failed/)
  assert.equal(failed.terminated, true)
  const unreadable = new FakeWorker()
  const decode = runCodeStudioJob(() => unreadable, {})
  unreadable.events.get('messageerror')()
  await assert.rejects(decode, /tidak dapat dibaca/)
  assert.equal(unreadable.terminated, true)
  const cannotClone = new FakeWorker()
  cannotClone.postMessage = () => { throw new DOMException('Clone failed', 'DataCloneError') }
  await assert.rejects(runCodeStudioJob(() => cannotClone, {}), { name: 'DataCloneError' })
  assert.equal(cannotClone.events.size, 0)
})

test('GLB export has a real version 2 binary model and keeps material color', async (t) => {
  const previous = globalThis.FileReader
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.() })
    }
  }
  t.after(() => {
    if (previous === undefined) delete globalThis.FileReader
    else globalThis.FileReader = previous
  })
  const wasm = await Module(); wasm.setup()
  const result = buildCodeStudioResult(buildCodeStudio(wasm, 'return sphere(5)'), { color: '#ff0000' })
  try {
    const blob = await result.getBaseGlbBlob()
    const buffer = await blob.arrayBuffer()
    const view = new DataView(buffer)
    assert.equal(view.getUint32(0, true), 0x46546c67)
    assert.equal(view.getUint32(4, true), 2)
    assert.equal(view.getUint32(8, true), buffer.byteLength)
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, view.getUint32(12, true))))
    assert.equal(json.meshes.length, 1)
    assert.deepEqual(json.materials[0].pbrMetallicRoughness.baseColorFactor, [1, 0, 0, 1])
    assert.equal(await result.getBaseGlbBlob(), blob)
  } finally { result.dispose() }
})

test('actual worker handler loads WASM and serializes success and syntax errors', async (t) => {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'manifold-3d/manifold.wasm?url') {
        const path = fileURLToPath(import.meta.resolve('manifold-3d/manifold.wasm'))
        return { url: `data:text/javascript,${encodeURIComponent(`export default ${JSON.stringify(path)}`)}`, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    }
  })
  t.after(() => hooks.deregister())
  const previous = globalThis.self
  const messages = []
  globalThis.self = { postMessage: (data, transfer) => messages.push({ data, transfer }) }
  t.after(() => {
    if (previous === undefined) delete globalThis.self
    else globalThis.self = previous
  })
  await import('../workers/codeStudio.worker.js')
  await self.onmessage({ data: { source: 'return box(10,10,10)', values: {} } })
  assert.equal(messages[0].data.result.volumeMm3, 1000)
  assert.equal(messages[0].transfer[0], messages[0].data.result.geometry.positions.buffer)
  await self.onmessage({ data: { source: 'return fetch("/api/auth/me")', values: {} } })
  assert.match(messages[1].data.error, /Fungsi fetch tidak tersedia/)
})
