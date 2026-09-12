import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import Module from 'manifold-3d'
import jsQR from 'jsqr'
import { unzipSync, strFromU8 } from 'fflate'
import { Window } from 'happy-dom'
import { createQrPlateDesign, qrPayload, qrPlateSvg } from '../utils/qrPlateDesign.js'
import { qrPlateScad } from '../utils/qrPlateScad.js'
import { QR_PLATE_ICONS } from '../utils/qrPlateIcons.js'
import { parseSvgToShapes, serializeShapes } from '../utils/svgToShapes.js'
registerHooks({ resolve(specifier, context, next) { return next(specifier === 'opentype.js' ? 'opentype.js/dist/opentype.mjs' : specifier, context) } })
const { buildQrPlate } = await import('../utils/qrPlateCore.js')
const { buildQrPlateResult } = await import('../utils/qrPlateGenerator.js')
const wasm = await Module(); wasm.setup()
const fontBytes = readFileSync(new URL('../public/fonts/Roboto-Bold.woff', import.meta.url))
const font = fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength)
const dom = new Window()
globalThis.DOMParser = dom.DOMParser
test.after(async () => { delete globalThis.DOMParser; await dom.happyDOM.close() })
const logoShapes = serializeShapes(parseSvgToShapes('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>'))

function solid(geometry) {
  const positions = geometry.positions || geometry.attributes.position.array
  const indices = geometry.indices || geometry.index?.array
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: positions, triVerts: indices,
    mergeFromVert: geometry.mergeFromVert, mergeToVert: geometry.mergeToVert })
  if (!geometry.mergeFromVert) mesh.merge()
  const result = wasm.Manifold.ofMesh(mesh)
  assert.equal(result.status(), 'NoError')
  assert.ok(result.volume() > 0)
  return result
}
function connected(s) {
  const pieces = s.decompose()
  try { assert.equal(pieces.length, 1) } finally { pieces.forEach((p) => p.delete()) }
}
// Rasterize actual horizontal mesh faces, not the input matrix. This catches
// upside-down QR modules, missing triangles and errors in the exported coordinates.
function scanMesh(raw, code = raw.design.codes[0]) {
  const { design } = raw
  const { positions: p, indices } = raw.parts.find((part) => part.role === 'detail').geometry
  const n = (code.size + 8) * 8
  const rgba = new Uint8ClampedArray(n * n * 4).fill(255)
  const top = design.opts.baseThicknessMm + (design.opts.surfaceMode === 'raised' ? design.opts.detailHeightMm : 0)
  const project = (index) => [((p[index*3] - code.centerX) / design.opts.qrSizeMm + 0.5) * n, (0.5 - (p[index*3+1] - code.centerY) / design.opts.qrSizeMm) * n]
  const edge = (a,b,x,y) => (x-a[0])*(b[1]-a[1]) - (y-a[1])*(b[0]-a[0])
  for (let i = 0; i < indices.length; i += 3) {
    const ids = Array.from(indices.slice(i,i+3))
    if (!ids.every((id) => Math.abs(p[id*3+2] - top) < 1e-5)) continue
    const [a,b,c] = ids.map(project)
    for (let y = Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))); y < Math.min(n,Math.ceil(Math.max(a[1],b[1],c[1]))); y++) {
      for (let x = Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))); x < Math.min(n,Math.ceil(Math.max(a[0],b[0],c[0]))); x++) {
        const edges = [edge(a,b,x+.5,y+.5),edge(b,c,x+.5,y+.5),edge(c,a,x+.5,y+.5)]
        if (edges.every((v) => v >= -1e-6) || edges.every((v) => v <= 1e-6)) rgba.fill(0,(y*n+x)*4,(y*n+x)*4+3)
      }
    }
  }
  return jsQR(rgba,n,n)?.data
}

test('URL, Unicode text and escaped Wi-Fi content preserve the intended payload', () => {
  assert.equal(qrPayload({ content: ' https://example.com/menu?a=1&b=2 ' }), 'https://example.com/menu?a=1&b=2')
  assert.equal(qrPayload({ contentType: 'text', content: '  Halo 世界 ☕\nNuma3D  ' }), '  Halo 世界 ☕\nNuma3D  ')
  const wifi = qrPayload({ contentType: 'wifi', wifiSsid: 'Numa;Cafe', wifiPassword: 'a:b,c\\d"', wifiHidden: true })
  assert.equal(wifi, 'WIFI:T:WPA;S:Numa\\;Cafe;P:a\\:b\\,c\\\\d\\";H:true;;')
  assert.equal(qrPayload({ contentType: 'wifi', wifiSsid: 'Guest', wifiSecurity: 'nopass', wifiPassword: 'ignored' }), 'WIFI:T:nopass;S:Guest;H:false;;')
})

test('invalid, unreadable and unsupported designs are rejected before mesh work', () => {
  for (const options of [
    { content: '' }, { content: 'javascript:alert(1)' }, { content: 'example.com' },
    { contentType: 'wifi', wifiSsid: 'é'.repeat(17), wifiPassword: 'abc' },
    { contentType: 'wifi', wifiSsid: 'Cafe' }, { contentType: 'text', content: 'a'.repeat(1025) },
    { qrSizeMm: 25, contentType: 'text', content: 'abcdefghij'.repeat(20) },
    { colors: { base: '#ffffff', detail: '#eeeeee' } }, { colors: { base: '#000000' } },
    { surfaceMode: 'inlay', baseThicknessMm: 1.2, detailHeightMm: 1 },
    { standClearanceMm: -1 }, { standWidthMm: 10 }, { standStyle: 'bad' }, { iconId: 'bad' },
    { caption: 'two\nlines' }, { qrSizeMm: NaN },
    { plateLayout: 'wifi-whatsapp', wifiSsid: 'Cafe', wifiPassword: 'secret' },
    { plateLayout: 'desk' }
  ]) assert.throws(() => createQrPlateDesign(options), undefined, JSON.stringify(options))
  const wall = createQrPlateDesign({ mounting: 'wall' })
  const keyring = createQrPlateDesign({ mounting: 'keyring' })
  assert.equal(wall.stand, null)
  assert.equal(wall.holes.length, 4)
  assert.equal(keyring.holes.length, 1)
  assert.ok(wall.depthMm > keyring.depthMm)
  const [topLeft, topRight, bottomLeft, bottomRight] = wall.holes
  assert.ok(topLeft[1] > 0 && topRight[1] > 0)
  assert.ok(bottomLeft[1] < 0 && bottomRight[1] < 0)
  assert.equal(topLeft[0], bottomLeft[0])
  assert.equal(topRight[0], bottomRight[0])
  assert.equal(topLeft[1], topRight[1])
  assert.equal(bottomLeft[1], bottomRight[1])
  const svg = qrPlateSvg(createQrPlateDesign())
  assert.match(svg, /shape-rendering="crispEdges"/)
  assert.ok(!svg.includes('example.com'))
})

test('Wi-Fi + WhatsApp plate keeps two scannable faces from SSID and uploaded payload', async () => {
  const whatsappPayload = 'https://wa.me/6281234567890'
  const input = {
    plateLayout: 'wifi-whatsapp', wifiSsid: 'Numa;Cafe', wifiPassword: 'b:c\\d', wifiHidden: true,
    whatsappPayload, wifiCaption: '', whatsappCaption: '', standStyle: 'none', qrSizeMm: 52
  }
  const design = createQrPlateDesign(input)
  assert.equal(design.codes.length, 2)
  assert.equal(design.codes[0].id, 'wifi')
  assert.equal(design.codes[1].payload, whatsappPayload)
  assert.ok(design.codes[0].centerX < 0 && design.codes[1].centerX > 0)
  for (const surfaceMode of ['raised', 'inlay']) {
    const raw = buildQrPlate(wasm, { ...input, surfaceMode })
    assert.equal(scanMesh(raw, raw.design.codes[0]), raw.design.codes[0].payload)
    assert.equal(scanMesh(raw, raw.design.codes[1]), whatsappPayload)
    const merged = solid(raw.geometry)
    try { connected(merged) } finally { merged.delete() }
  }
  const withStand = buildQrPlateResult(buildQrPlate(wasm, { ...input, standStyle: 'slot', wifiCaption: 'Wi-Fi', whatsappCaption: 'WhatsApp' }, font))
  try {
    const text = await withStand.getScadBlob().text()
    assert.match(text, /qr_columns = 2/)
    assert.match(text, /column_icons = \[\[/)
  } finally { withStand.dispose() }
})

for (const surfaceMode of ['raised','inlay']) test(`${surfaceMode}: exported QR faces decode for URL, Unicode and Wi-Fi`, () => {
  for (const input of [
    {}, { contentType: 'text', content: 'Halo 世界 ☕\n Numa3D' },
    { contentType: 'wifi', wifiSsid: 'Numa;Cafe', wifiPassword: 'b:c\\d', wifiHidden: true }
  ]) {
    const raw = buildQrPlate(wasm, { ...input, surfaceMode })
    assert.equal(scanMesh(raw), raw.design.payload)
    const merged = solid(raw.geometry)
    try { connected(merged) } finally { merged.delete() }
  }
})

for (const standStyle of ['slot','post','twist']) test(`${standStyle}: stand is connected, slot clears the assembled plate and print parts are separate`, () => {
  for (const extremes of [{}, { baseThicknessMm: 8, standClearanceMm: 0.15, standTiltDeg: 20 }, { baseThicknessMm: 1.2, standClearanceMm: 1, standTiltDeg: 0 }]) {
    const raw = buildQrPlate(wasm, { ...extremes, standStyle, caption: 'Scan me' }, font)
    const result = buildQrPlateResult(raw)
    const solids = result.assemblyPreviewParts.map((p) => ({ group: p.group, solid: solid(p.geometry) }))
    const plate = wasm.Manifold.union(solids.filter((p) => p.group === 'plate').map((p) => p.solid))
    const stand = solids.find((p) => p.group === 'stand').solid
    const overlap = stand.intersect(plate)
    try {
      connected(stand)
      assert.ok(overlap.volume() < 0.001, `slot must fit, intersection volume ${overlap.volume()}`)
      const [printPlate, printStand] = ['plate','stand'].map((group) => result.printPreviewParts.filter((p) => p.group === group).map((p) => { p.geometry.computeBoundingBox(); return p.geometry.boundingBox }))
      assert.ok(Math.max(...printPlate.map((b) => b.max.x)) < Math.min(...printStand.map((b) => b.min.x)))
    } finally { overlap.delete(); plate.delete(); solids.forEach((p) => p.solid.delete()); result.dispose() }
  }
})

test('every icon, caption and mounting mode yields a closed connected plate with isolated colors', () => {
  for (const [i, icon] of QR_PLATE_ICONS.entries()) {
    const raw = buildQrPlate(wasm, { iconId: icon.id, standStyle: 'none', mounting: ['none','keyring','wall'][i % 3], caption: i % 2 ? 'Wi-Fi' : '', surfaceMode: i % 2 ? 'inlay' : 'raised' }, font)
    const merged = solid(raw.geometry)
    const colors = raw.parts.map((p) => solid(p.geometry))
    try {
      connected(merged)
      assert.ok(Math.abs(colors.reduce((sum,s) => sum+s.volume(),0) - merged.volume()) < 0.02, 'colors must not overlap')
      assert.equal(scanMesh(raw), raw.design.payload)
      if (raw.design.opts.mounting === 'wall') {
        assert.equal(raw.design.holes.length, 4)
        assert.match(qrPlateScad(raw.design), /for \(y = \[depth\/2-mount_band\/2, -depth\/2\+mount_band\/2\]\)/)
      }
    } finally { merged.delete(); colors.forEach((s) => s.delete()) }
  }
})

test('coordinate welding used by STL importers preserves QR volume at diagonal junctions', () => {
  for (const surfaceMode of ['raised', 'inlay']) {
    const raw = buildQrPlate(wasm, { surfaceMode, standStyle: 'none' })
    for (const part of raw.parts) {
      const original = solid(part.geometry)
      const welded = solid({ positions: part.geometry.positions, indices: part.geometry.indices })
      try { assert.ok(Math.abs(original.volume() - welded.volume()) < 0.001, `${surfaceMode} ${part.role}`) }
      finally { original.delete(); welded.delete() }
    }
  }
})

test('business name and logo reserve a header band above the QR and stay scannable', () => {
  const plain = createQrPlateDesign({ standStyle: 'none', iconId: 'none' })
  const named = createQrPlateDesign({ standStyle: 'none', iconId: 'none', businessName: 'Numa Cafe' })
  const branded = createQrPlateDesign({
    standStyle: 'none', iconId: 'none', businessName: 'Numa Cafe',
    headerLogoShapes: logoShapes, headerLogoSizeMm: 12
  })
  assert.ok(named.headerBandMm > 0)
  assert.ok(branded.headerBandMm > named.headerBandMm)
  assert.ok(branded.depthMm > plain.depthMm)
  assert.ok(branded.businessNameCenterY > branded.codes[0].centerY)
  assert.ok(branded.headerLogoCenterY > branded.businessNameCenterY)
  for (const surfaceMode of ['raised', 'inlay']) {
    const raw = buildQrPlate(wasm, {
      standStyle: 'none', iconId: 'none', businessName: 'Numa Cafe',
      headerLogoShapes: logoShapes, headerLogoSizeMm: 12, surfaceMode
    }, font)
    assert.equal(scanMesh(raw), raw.design.payload)
    assert.ok(raw.design.businessNameRings.rings.length > 0)
    assert.ok(raw.design.headerLogoRings.rings.length > 0)
    assert.ok(raw.parts.some((part) => part.role === 'icon'))
    const merged = solid(raw.geometry)
    try { connected(merged) } finally { merged.delete() }
    const scad = qrPlateScad(raw.design)
    assert.match(scad, /business_points = \[\[/)
    assert.match(scad, /header_logo_rings = \[\[/)
    assert.match(scad, /header_band = /)
  }
})

test('logo and caption stroke thicken the decoration mesh and SCAD offset', () => {
  const thin = buildQrPlate(wasm, {
    standStyle: 'none', iconId: 'none', caption: 'PAY',
    headerLogoShapes: logoShapes, headerLogoSizeMm: 12, headerLogoStrokeMm: 0, captionStrokeMm: 0
  }, font)
  const thick = buildQrPlate(wasm, {
    standStyle: 'none', iconId: 'none', caption: 'PAY',
    headerLogoShapes: logoShapes, headerLogoSizeMm: 12, headerLogoStrokeMm: 1.2, captionStrokeMm: 0.8
  }, font)
  const a = solid(thin.parts.find((part) => part.role === 'icon').geometry)
  const b = solid(thick.parts.find((part) => part.role === 'icon').geometry)
  try { assert.ok(b.volume() > a.volume() * 1.05) } finally { a.delete(); b.delete() }
  const scad = qrPlateScad(thick.design)
  assert.match(scad, /header_logo_stroke = 1\.2/)
  assert.match(scad, /caption_stroke = 0\.8/)
  assert.match(scad, /offset\(r=d\/2/)
})

test('uploaded logos keep holes, nested islands and overlapping fills in mesh and SCAD at 28 mm', () => {
  const sources = [
    { body: '<path fill-rule="evenodd" d="M0 0H40V40H0Z M10 10H30V30H10Z M17 17H23V23H17Z"/>', area: 1236 },
    { body: '<g transform="translate(40 0) scale(-1 1)"><path fill="none" stroke="black" stroke-width="0.3" d="M1 1H39V39H1Z"/></g>', area: 45.6, span: 38.3 },
    { body: '<path fill="red" fill-rule="evenodd" d="M0 0H40V40H0Z M10 10H30V30H10Z"/><rect x="20" y="15" width="20" height="10" fill="blue"/>', area: 1300 }
  ]
  for (const { body, area, span = 40 } of sources) for (const surfaceMode of ['raised', 'inlay']) {
    const headerLogoShapes = serializeShapes(parseSvgToShapes(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`))
    const raw = buildQrPlate(wasm, { headerLogoShapes, headerLogoSizeMm: 28, headerLogoStrokeMm: 0,
      iconId: 'none', standStyle: 'none', surfaceMode })
    const artwork = solid(raw.parts.find((part) => part.role === 'icon').geometry)
    const expectedArea = area * (28 / span) ** 2
    try { assert.ok(Math.abs(artwork.volume() / raw.design.opts.detailHeightMm - expectedArea) < 0.01, `artwork area ${artwork.volume() / raw.design.opts.detailHeightMm}, expected ${expectedArea}, source ${body}`) }
    finally { artwork.delete() }
    assert.equal(raw.warnings.some((warning) => warning.startsWith('Logo memiliki detail sempit')), span === 38.3)
    const source = qrPlateScad(raw.design)
    const points = JSON.parse(source.match(/^header_logo_points = (.*);$/m)[1])
    const paths = JSON.parse(source.match(/^header_logo_paths = (.*);$/m)[1])
    assert.match(source, /polygon\(points=header_logo_points, paths=header_logo_paths\)/)
    // OpenSCAD polygon paths use even/odd nesting. Overlapping SVG fills must
    // already be united, so their overlap does not become a hole in the source.
    const scadSection = new wasm.CrossSection(paths.map((path) => path.map((i) => points[i])), 'EvenOdd')
    try { assert.ok(Math.abs(scadSection.area() - expectedArea) < 0.01) }
    finally { scadSection.delete() }
    assert.equal(scanMesh(raw), raw.design.payload)
  }
})

test('editing caption or QR text changes the exported mesh and SCAD contours', () => {
  const pay = buildQrPlate(wasm, { standStyle: 'none', iconId: 'none', caption: 'PAY', content: 'https://a.example/' }, font)
  const menu = buildQrPlate(wasm, { standStyle: 'none', iconId: 'none', caption: 'MENU', content: 'https://b.example/' }, font)
  const payIcon = pay.parts.find((part) => part.role === 'icon')
  const menuIcon = menu.parts.find((part) => part.role === 'icon')
  assert.ok(payIcon && menuIcon)
  assert.notDeepEqual(
    Array.from(payIcon.geometry.positions.slice(0, 24)),
    Array.from(menuIcon.geometry.positions.slice(0, 24))
  )
  assert.notEqual(pay.design.payload, menu.design.payload)
  const payScad = qrPlateScad(pay.design)
  const menuScad = qrPlateScad(menu.design)
  assert.match(payScad, /caption_points = \[\[/)
  assert.notEqual(payScad, menuScad)
})

test('3MF separates stand from multipart plaque, STL keeps all parts and SCAD includes stand and icon', async () => {
  const result = buildQrPlateResult(buildQrPlate(wasm, { standStyle: 'twist', iconId: 'card', caption: 'PAY', surfaceMode: 'inlay' }, font))
  try {
    const zip = unzipSync(new Uint8Array(await result.get3mfBlob().arrayBuffer()))
    const xml = strFromU8(zip['3D/3dmodel.model'])
    const settings = JSON.parse(strFromU8(zip['Metadata/project_settings.config']))
    assert.equal(settings.wall_generator, 'arachne')
    assert.equal(settings.layer_height, '0.12')
    assert.ok(settings.filament_type.every((type) => type === 'PLA'))
    assert.equal((xml.match(/<item /g) || []).length, 2)
    assert.equal((xml.match(/<component /g) || []).length, 5)
    assert.match(xml, /displaycolor="#172A46FF"/i)
    const stls = unzipSync(new Uint8Array(await result.getStlZipBlob().arrayBuffer()))
    for (const role of ['frame','base','detail','icon','stand']) {
      const stl = stls[`qr_plate_${role}.stl`]
      assert.ok(stl?.length > 84)
      const count = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80,true)
      assert.equal(stl.length,84 + count * 50)
    }
    const scad = await result.getScadBlob().text()
    assert.match(scad, /stand_style = "twist"/)
    assert.match(scad, /module stand\(\)/)
    assert.match(scad, /icon_solids = \[\[/)
    assert.match(scad, /caption_points = \[\[/)
    assert.match(scad, /layout = "print"/)
  } finally { result.dispose() }
  assert.throws(() => result.get3mfBlob(), /Generate ulang/)
})
