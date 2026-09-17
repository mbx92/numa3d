import test from 'node:test'
import assert from 'node:assert/strict'
import Module from 'manifold-3d'
import { compileCodeStudio, CODE_LIMITS } from '../utils/codeStudioLanguage.js'
import { buildCodeStudio } from '../utils/codeStudioEngine.js'
import { buildCodeStudioResult, createCodeStudioGenerator } from '../utils/codeStudioGenerator.js'
import { compileField, planField, smoothMinimum, meshField } from '../utils/codeStudioSdf.js'
import { inspectMesh } from '../utils/codeStudioHealth.js'
import { CODE_STUDIO_EXAMPLES } from '../utils/codeStudioExamples.js'
import { buildCodeStudioAiPrompt } from '../utils/codeStudioAi.js'
import { parse3MF } from '../utils/clickerManifold/threemfImport.js'

const wasm = await Module()
wasm.setup()
const build = (code) => buildCodeStudio(wasm, code)
const near = (a, b, tolerance = 1e-4) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b} (+/-${tolerance})`)
function valid(raw, expected, tolerance = 1e-4) {
  assert.ok(raw.triangles > 0 && raw.triangles <= CODE_LIMITS.triangles)
  assert.ok(raw.volumeMm3 > 0 && Number.isFinite(raw.volumeMm3))
  assert.ok(raw.geometry.positions.every(Number.isFinite))
  assert.ok(raw.geometry.normals.every(Number.isFinite))
  assert.equal(raw.geometry.normals.length, raw.geometry.positions.length)
  for (let i = 0; i < raw.geometry.normals.length; i += 3) near(Math.hypot(...raw.geometry.normals.subarray(i, i + 3)), 1, 1e-4)
  assert.equal(inspectMesh(raw.geometry).closed, true)
  if (expected) Object.values(raw.dimensions).forEach((value, i) => near(value, expected[i], tolerance))
}

test('roundedBox has real rounded corners, exact extents and analytic rounded-solid volume', async () => {
  const raw = build('return roundedBox(60,40,20,4)')
  valid(raw, [60, 40, 20])
  const core = [52, 32, 12], r = 4
  const exact = core[0] * core[1] * core[2] + 2 * r * (core[0] * core[1] + core[1] * core[2] + core[0] * core[2]) + Math.PI * r * r * core.reduce((a, b) => a + b) + 4 / 3 * Math.PI * r ** 3
  near(raw.volumeMm3 / exact, 1, 0.002)
  assert.ok(raw.triangles > 100)
  for (let i = 0; i < raw.geometry.positions.length; i += 3) {
    const [x, y, z] = raw.geometry.positions.subarray(i, i + 3)
    assert.ok(!(Math.abs(x) > 29.9 && Math.abs(y) > 19.9 && z > 19.9), 'sharp box corner must not exist')
  }
  const result = buildCodeStudioResult(raw)
  try { assert.equal((await result.getBaseBlob().arrayBuffer()).byteLength, 84 + raw.triangles * 50) } finally { result.dispose() }
})

test('roundedBox accepts zero/maximal radius and extreme valid aspect ratios', () => {
  valid(build('return roundedBox(10,10,10,0)'), [10, 10, 10])
  const ball = build('return roundedBox(10,10,10,5)')
  valid(ball, [10, 10, 10])
  near(ball.volumeMm3, build('return sphere(5)').volumeMm3)
  valid(build('return roundedBox(1000,0.02,0.02,0.01)'), [1000, 0.02, 0.02])
  valid(build('return roundedBox(0.01,0.01,0.1,0.005)'), [0.01, 0.01, 0.1])
})

test('new operations reject invalid dimensions, arity, options and unsupported implicit inputs', () => {
  for (const code of [
    'roundedBox(10,20,30,-1)', 'roundedBox(10,20,30,5.01)', 'roundedBox(0,20,30,0)', 'roundedBox(1,2,3)',
    'capsule({radius:4,height:7})', 'capsule({radius:4,height:8,segments:48})',
    'hull(sphere(2))', 'hull(sphere(2),[1,2,3])', 'smoothUnion(sphere(2),sphere(2),0)',
    'smoothUnion(sphere(2),sphere(2),101)', 'smoothUnion(sphere(2),sphere(2),"2")',
    'smoothUnion(hull(sphere(2),sphere(3)),sphere(4),2)',
    'smoothUnion(subtract(sphere(3),sphere(1)),sphere(2),2)',
    'smoothUnion(scale(sphere(2),[1,2,1]),sphere(2),2)',
    'smoothUnion(torus({major:5,minor:1}),sphere(2),2)',
    'smoothUnion(extrude(rect2d(4,4),2),sphere(2),2)',
    'smoothUnion({op:"sphere",args:[2]},sphere(2),2)'
  ]) assert.throws(() => compileCodeStudio(`return ${code}`), /Baris/, code)
})

test('hull joins separated spheres, transformed shapes and multiple inputs as a convex solid', () => {
  const raw = build('return hull(sphere(10),translate(sphere(8),[0,0,30]))')
  valid(raw, [20, 20, 48])
  assert.equal(raw.health.components, 1)
  assert.ok(raw.volumeMm3 > build('return union(sphere(10),translate(sphere(8),[0,0,30]))').volumeMm3 * 1.5)
  valid(build('return hull(translate(box(4,4,4),[-10,0,0]),translate(box(4,4,4),[10,0,0]),translate(sphere(2),[0,10,0]))'), [24, 14, 4])
  valid(build('return rotate(hull(sphere(3),translate(sphere(3),[0,0,20])),[0,90,0])'), [26, 6, 6])
  const capsule = build('return capsule({radius:3,height:26})')
  valid(capsule, [6, 6, 26])
  near(capsule.volumeMm3, build('return hull(sphere(3),translate(sphere(3),[0,0,20]))').volumeMm3)
})

test('croissant stays connected with an open crescent and a thick center across parameter extremes', () => {
  const code = CODE_STUDIO_EXAMPLES.find((e) => e.id === 'croissant').code
  for (const values of [
    {}, { size: 18, puff: 10, flatten: 0.5, curl: 12 },
    { size: 48, puff: 16, flatten: 0.8, curl: 55 },
    { size: 48, puff: 10, flatten: 0.8, curl: 12 },
    { size: 18, puff: 16, flatten: 0.5, curl: 55 }
  ]) {
    const raw = buildCodeStudio(wasm, code, values), size = values.size ?? 30
    valid(raw)
    assert.equal(raw.health.components, 1)
    let innerRadius = Infinity, centerHeight = 0, tipMinZ = Infinity, tipMaxZ = -Infinity
    const positions = raw.geometry.positions
    for (let i = 0; i < positions.length; i += 3) {
      const x = -positions[i], y = -positions[i + 1], z = positions[i + 2]
      const angle = Math.atan2(y, x) * 180 / Math.PI
      innerRadius = Math.min(innerRadius, Math.hypot(x, y))
      if (angle > 85 && angle < 95) centerHeight = Math.max(centerHeight, z)
      if (angle > 9 && angle < 12) { tipMinZ = Math.min(tipMinZ, z); tipMaxZ = Math.max(tipMaxZ, z) }
    }
    assert.ok(innerRadius > size * 0.4, 'crescent opening must remain clear')
    assert.ok(Number.isFinite(tipMinZ) && tipMaxZ > tipMinZ)
    assert.ok(centerHeight > 3 * (tipMaxZ - tipMinZ), 'ends must be much thinner than the central roll')
  }
})

test('smoothUnion is a deterministic closed blend with more join volume than hard union', () => {
  const code = 'const a = sphere(8); const b = translate(sphere(8),[10,0,0]); return smoothUnion(a,b,4)'
  const raw = build(code), again = build(code)
  valid(raw, [26, 16, 16], 0.15)
  assert.deepEqual(raw.geometry, again.geometry)
  assert.equal(raw.health.components, 1)
  assert.ok(raw.volumeMm3 > build('return union(sphere(8),translate(sphere(8),[10,0,0]))').volumeMm3 * 1.015)
  const field = compileField(compileCodeStudio(code).root)
  near(smoothMinimum(0, 0, 4), -1)
  assert.ok(field.distance(5, Math.sqrt(64 - 25) + 0.5, 0) < 0, 'blend must expand the concave join')
})

test('smoothUnion preserves separated components with warnings and handles rotated cylinder branches', () => {
  const separate = build('return smoothUnion(sphere(5),translate(sphere(5),[20,0,0]),3)')
  valid(separate, [30, 10, 10], 0.15)
  assert.equal(separate.health.components, 2)
  assert.match(separate.health.warnings.join(' '), /terpisah/)
  valid(build('const a = cylinder({radius:8,height:50}); const b = translate(rotate(cylinder({radius:5,height:25}),[0,90,0]),[8,0,20]); return smoothUnion(a,b,5)'))
  valid(build('return subtract(smoothUnion(sphere(8),translate(sphere(6),[8,0,0]),4),cylinder({radius:2,height:30}))'))
})

test('analytic transforms agree with the native global XYZ rotation and uniform scale', () => {
  const source = 'translate(rotate(scale(box(10,14,20),[2,2,2]),[23,37,61]),[7,-3,5])'
  const field = compileField(compileCodeStudio(`return ${source}`).root)
  const raw = build(`return ${source}`)
  const dz = field.bounds.min[2]
  for (let i = 0; i < raw.geometry.positions.length; i += 3) {
    const [x, y, z] = raw.geometry.positions.subarray(i, i + 3)
    near(field.distance(x, y, z + dz), 0, 1e-4)
  }
  valid(build(`return smoothUnion(${source},translate(sphere(8),[7,-3,5]),6)`))
})

test('finite field preflight rejects excessive grids before invoking native allocation', () => {
  const oversized = compileField(compileCodeStudio('return smoothUnion(sphere(100),translate(sphere(1),[150,0,0]),0.1)').root)
  assert.throws(() => planField(oversized), /terlalu rinci/)
  const field = compileField(compileCodeStudio('return smoothUnion(sphere(5),sphere(5),3)').root)
  const plan = planField(field)
  assert.ok(plan.cells <= CODE_LIMITS.fieldCells)
  assert.throws(() => meshField({ Manifold: { levelSet: () => assert.fail('must not allocate') } }, field, plan, { samples: 0, work: CODE_LIMITS.fieldWork }), /Total sampling/)
  assert.throws(() => meshField({ Manifold: { levelSet: (fn) => fn([0, 0, 0]) } }, field, plan, { samples: CODE_LIMITS.fieldSamples, work: 0 }), /Sampling/)
  assert.throws(() => build('return smoothUnion(translate(sphere(5),[10000,0,0]),sphere(5),3)'), /batas ukuran/)
  assert.throws(() => build('return smoothUnion(scale(scale(sphere(10),[100,100,100]),[0.01,0.01,0.01]),sphere(10),3)'), /batas ukuran/)
})

test('CSG through-hole, open cavity, nested boolean and translated cutter preserve analytic volumes', () => {
  const cases = [
    ['subtract(box(20,20,10),cylinder({radius:3,height:14,segments:96}))', 4000 - Math.PI * 9 * 10, 1],
    ['subtract(box(20,20,20),translate(box(16,16,20),[0,0,2]))', 8000 - 16 * 16 * 18, 1],
    ['intersect(subtract(box(20,20,20),box(10,10,10)),translate(box(20,20,20),[10,0,0]))', 3500, 1],
    ['subtract(box(20,20,10),translate(box(4,4,20),[5,0,0]))', 3840, 1]
  ]
  for (const [source, volume, components] of cases) {
    const raw = build(`return ${source}`)
    valid(raw)
    near(raw.volumeMm3, volume, 0.3)
    assert.equal(raw.health.components, components)
  }
  const cavity = build('return subtract(box(20,20,20),box(16,16,16))')
  assert.equal(cavity.health.components, 1, 'internal shell is not a disconnected fragment')
  assert.equal(cavity.health.shells, 2)
})

test('health detects broken topology, degeneracy, duplicates, nonfinite values and invalid indices', () => {
  const raw = build('return box(10,10,10)').geometry
  assert.equal(inspectMesh({ ...raw, indices: raw.indices.slice(3) }).boundaryEdges, 3)
  const duplicate = { ...raw, indices: Uint32Array.from([...raw.indices, ...raw.indices.slice(0, 3)]) }
  assert.equal(inspectMesh(duplicate).duplicateTriangles, 1)
  assert.equal(inspectMesh(duplicate).nonManifoldEdges, 3)
  const zero = { ...raw, indices: Uint32Array.from([0, 0, 0]) }
  assert.equal(inspectMesh(zero).degenerateTriangles, 1)
  const flipped = { ...raw, indices: raw.indices.slice() }
  ;[flipped.indices[0], flipped.indices[1]] = [flipped.indices[1], flipped.indices[0]]
  assert.equal(inspectMesh(flipped).inconsistentEdges, 3)
  const invalid = { ...raw, positions: raw.positions.slice() }
  invalid.positions[0] = NaN
  assert.throws(() => inspectMesh(invalid), /finite/)
  assert.throws(() => inspectMesh({ ...raw, indices: new Uint32Array([0, 1, 999999]) }), /Index/)
})

test('2D profiles extrude and revolve into closed solids; empty profiles are rejected', () => {
  const plate = build('return extrude(rect2d(10,20),5)')
  valid(plate, [10, 20, 5])
  near(plate.volumeMm3, 1000)
  const disk = build('return extrude(circle2d({radius:10,segments:96}),10)')
  valid(disk)
  near(disk.volumeMm3 / (Math.PI * 100 * 10), 1, 0.01)
  const hex = build('return extrude(polygon({sides:6,radius:10}),4)')
  valid(hex)
  near(hex.volumeMm3 / (3 * Math.sqrt(3) / 2 * 100 * 4), 1, 0.002)
  const grown = build('return extrude(offset(rect2d(10,10),2),4)')
  valid(grown)
  assert.ok(grown.volumeMm3 > 10 * 10 * 4)
  assert.ok(grown.volumeMm3 < 14 * 14 * 4)
  const bowl = build('const rim = translate2d(rect2d(2,12),[11,6]); const floor = translate2d(rect2d(12,2),[6,1]); return revolve(union2d(rim,floor),{segments:64})')
  valid(bowl)
  assert.equal(bowl.health.components, 1)
  assert.ok(bowl.dimensions.heightMm > 11 && bowl.dimensions.heightMm < 13)
  const star = build('return extrude(polygon({sides:5,radius:20,inner:0.42}),3)')
  valid(star)
  assert.ok(star.volumeMm3 > 200)
  assert.throws(() => build('return extrude(subtract2d(rect2d(8,8),rect2d(10,10)),2)'), /kosong/)
  assert.throws(() => compileCodeStudio('return rect2d(10,10)'), /bentuk 3D/)
})

test('all AI examples execute at defaults and individual parameter extremes', () => {
  const prompt = buildCodeStudioAiPrompt()
  for (const example of CODE_STUDIO_EXAMPLES.slice(4)) {
    assert.ok(prompt.includes(example.code))
    const defaults = build(example.code)
    valid(defaults)
    assert.equal(defaults.health.components, 1, example.id)
    for (const p of compileCodeStudio(example.code).parameters) for (const value of [p.min, p.max]) {
      const raw = buildCodeStudio(wasm, example.code, { [p.name]: value })
      valid(raw)
      assert.equal(raw.health.components, 1, `${example.id}/${p.name}=${value}`)
    }
  }
})

test('editor caches only last successful geometry; colors reuse it and buffers remain independently owned', async () => {
  let jobs = 0
  const generate = createCodeStudioGenerator(async ({ source, values }) => { jobs++; return buildCodeStudio(wasm, source, values) })
  const opts = { source: 'const w = param("w",10); return roundedBox(w,10,10,2)', values: {} }
  const first = await generate(opts)
  first.basePreviewParts[0].geometry.attributes.position.array[0] = 999
  first.dispose()
  const second = await generate({ ...opts, color: '#ff0000', label: 'Changed' })
  assert.equal(jobs, 1)
  assert.equal(second.basePreviewParts[0].color, '#ff0000')
  assert.notEqual(second.basePreviewParts[0].geometry.attributes.position.array[0], 999)
  second.dispose()
  ;(await generate({ ...opts, values: { w: 12 } })).dispose()
  assert.equal(jobs, 2)
  await assert.rejects(generate({ ...opts, values: { w: NaN } }), /Angka/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(generate(opts, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(jobs, 2)
  generate.clearCache()
  ;(await generate({ ...opts, values: { w: 12 } })).dispose()
  assert.equal(jobs, 3)
  generate.clearCache()
})

test('new geometry survives 3MF topology round-trip and exports finite GLB accessors', async (t) => {
  const previous = globalThis.FileReader
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.() }) }
  }
  t.after(() => {
    if (previous === undefined) delete globalThis.FileReader
    else globalThis.FileReader = previous
  })
  for (const code of [
    'return roundedBox(60,40,20,4)',
    'return roundedBox(0.01,0.01,0.1,0.005)',
    'return hull(sphere(10),translate(sphere(8),[0,0,30]))',
    'return smoothUnion(sphere(8),translate(sphere(8),[10,0,0]),4)',
    'return extrude(polygon({sides:6,radius:12}),4)',
    CODE_STUDIO_EXAMPLES.find((e) => e.id === 'smooth-cactus').code
  ]) {
    const raw = build(code), result = buildCodeStudioResult(raw)
    try {
      const imported = parse3MF(await result.getBase3mfBlob().arrayBuffer())
      assert.equal(imported.triVerts.length, raw.triangles * 3, 'export must retain triangles')
      assert.equal(inspectMesh({ positions: imported.vertProperties, indices: imported.triVerts }).closed, true)
      const mesh = new wasm.Mesh(imported), solid = new wasm.Manifold(mesh)
      try {
        assert.equal(solid.status(), 'NoError')
        // The importer casts plate-centered coordinates to Float32: relative
        // error is larger for a 0.01 mm model translated to the plate center.
        near(solid.volume() / raw.volumeMm3, 1, raw.dimensions.widthMm < 0.1 ? 0.005 : 0.0001)
      } finally { solid.delete() }
      const glb = await (await result.getBaseGlbBlob()).arrayBuffer(), view = new DataView(glb)
      assert.equal(view.getUint32(0, true), 0x46546c67)
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, view.getUint32(12, true))))
      const primitive = json.meshes[0].primitives[0]
      assert.equal(json.accessors[primitive.indices].count, raw.triangles * 3)
      assert.equal(json.accessors[primitive.attributes.NORMAL].count, raw.geometry.normals.length / 3)
      assert.ok(json.accessors[primitive.attributes.POSITION].min.every(Number.isFinite))
      assert.ok(json.accessors[primitive.attributes.POSITION].max.every(Number.isFinite))
    } finally { result.dispose() }
  }
})
