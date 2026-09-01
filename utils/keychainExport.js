// Export keychain dengan warna — 3MF (Bambu), GLB, STL multi-part, STL berwarna (Prusa).
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[i] = c >>> 0
}

function crc32(data) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function createZip(entries) {
  const enc = new TextEncoder()
  const localParts = []
  const centralRecords = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name)
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const checksum = crc32(bytes)
    const header = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(header.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint16(8, 0, true)
    dv.setUint32(14, checksum, true)
    dv.setUint32(18, bytes.length, true)
    dv.setUint32(22, bytes.length, true)
    dv.setUint16(26, nameBytes.length, true)
    header.set(nameBytes, 30)
    localParts.push(header, bytes)
    centralRecords.push({ nameBytes, checksum, size: bytes.length, offset })
    offset += header.length + bytes.length
  }

  const centralStart = offset
  const centralParts = []
  for (const rec of centralRecords) {
    const header = new Uint8Array(46 + rec.nameBytes.length)
    const dv = new DataView(header.buffer)
    dv.setUint32(0, 0x02014b50, true)
    dv.setUint16(4, 20, true)
    dv.setUint16(6, 20, true)
    dv.setUint16(8, 0, true)
    dv.setUint32(16, rec.checksum, true)
    dv.setUint32(20, rec.size, true)
    dv.setUint32(24, rec.size, true)
    dv.setUint16(28, rec.nameBytes.length, true)
    dv.setUint32(42, rec.offset, true)
    header.set(rec.nameBytes, 46)
    centralParts.push(header)
    offset += header.length
  }

  const end = new Uint8Array(22)
  const edv = new DataView(end.buffer)
  edv.setUint32(0, 0x06054b50, true)
  edv.setUint16(8, centralRecords.length, true)
  edv.setUint16(10, centralRecords.length, true)
  edv.setUint32(12, offset - centralStart, true)
  edv.setUint32(16, centralStart, true)

  const out = new Uint8Array(offset + 22)
  let pos = 0
  for (const p of localParts) {
    out.set(p, pos)
    pos += p.length
  }
  for (const p of centralParts) {
    out.set(p, pos)
    pos += p.length
  }
  out.set(end, pos)
  return out.buffer
}

function parseHexColor(hex) {
  const h = String(hex || '#888888').replace('#', '')
  if (h.length < 6) return { r: 136, g: 136, b: 136 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

function hexToDisplayColor(hex) {
  const h = String(hex || '#888888').replace('#', '')
  const r = h.slice(0, 2).padStart(2, '0')
  const g = h.slice(2, 4).padStart(2, '0')
  const b = h.slice(4, 6).padStart(2, '0')
  return `#${r}${g}${b}FF`.toUpperCase()
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeSolidName(name) {
  return String(name || 'part').replace(/[^\w.-]+/g, '_').slice(0, 40)
}

function meshExportParts(parts) {
  return (parts || []).filter((p) => !p.line && p.geometry?.attributes?.position?.count)
}

const VERTEX_WELD_SCALE = 100000

function vertexKey(pos, index) {
  return [
    Math.round(pos.getX(index) * VERTEX_WELD_SCALE),
    Math.round(pos.getY(index) * VERTEX_WELD_SCALE),
    Math.round(pos.getZ(index) * VERTEX_WELD_SCALE)
  ].join(',')
}

function addWeldedVertex(pos, sourceIndex, vertices, vertexMap) {
  const key = vertexKey(pos, sourceIndex)
  const existing = vertexMap.get(key)
  if (existing != null) return existing
  const next = vertices.length
  vertices.push({
    x: pos.getX(sourceIndex),
    y: pos.getY(sourceIndex),
    z: pos.getZ(sourceIndex)
  })
  vertexMap.set(key, next)
  return next
}

function geometryToMeshData(geometry) {
  const pos = geometry.attributes.position
  const index = geometry.index
  const vertices = []
  const triangles = []
  const vertexMap = new Map()
  const triangleCount = index ? index.count : pos.count

  for (let i = 0; i < triangleCount; i += 3) {
    const a = index ? index.getX(i) : i
    const b = index ? index.getX(i + 1) : i + 1
    const c = index ? index.getX(i + 2) : i + 2
    const v1 = addWeldedVertex(pos, a, vertices, vertexMap)
    const v2 = addWeldedVertex(pos, b, vertices, vertexMap)
    const v3 = addWeldedVertex(pos, c, vertices, vertexMap)
    if (v1 !== v2 && v2 !== v3 && v3 !== v1) triangles.push({ v1, v2, v3 })
  }
  return { vertices, triangles }
}

function triangleNormal(a, b, c) {
  const ab = new THREE.Vector3().subVectors(b, a)
  const ac = new THREE.Vector3().subVectors(c, a)
  return new THREE.Vector3().crossVectors(ab, ac).normalize()
}

/** 15-bit RGB Materialise colored STL attribute (PrusaSlicer). */
function colorToStlAttr(r, g, b) {
  const r5 = Math.round((r / 255) * 31) & 31
  const g5 = Math.round((g / 255) * 31) & 31
  const b5 = Math.round((b / 255) * 31) & 31
  return (1 << 15) | (b5 << 10) | (g5 << 5) | r5
}

function collectTriangles(geometry, color, out) {
  if (!geometry?.attributes?.position?.count) return
  const geo = geometry.index ? geometry.toNonIndexed() : geometry
  const pos = geo.attributes.position
  const { r, g, b } = parseHexColor(color)
  const attr = colorToStlAttr(r, g, b)

  const a = new THREE.Vector3()
  const bV = new THREE.Vector3()
  const c = new THREE.Vector3()

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    bV.fromBufferAttribute(pos, i + 1)
    c.fromBufferAttribute(pos, i + 2)
    const normal = triangleNormal(a, bV, c)
    out.push({
      nx: normal.x,
      ny: normal.y,
      nz: normal.z,
      ax: a.x,
      ay: a.y,
      az: a.z,
      bx: bV.x,
      by: bV.y,
      bz: bV.z,
      cx: c.x,
      cy: c.y,
      cz: c.z,
      attr
    })
  }
  if (geo !== geometry) geo.dispose()
}

/** STL binary berwarna per-segi (PrusaSlicer — Bambu Studio tidak mendukung). */
export function partsToColoredStlBuffer(parts) {
  const tris = []
  for (const part of meshExportParts(parts)) collectTriangles(part.geometry, part.color, tris)
  if (!tris.length) throw new Error('Tidak ada mesh untuk export STL berwarna')

  const buf = new ArrayBuffer(84 + tris.length * 50)
  const view = new DataView(buf)
  const header = 'Numa3D colored STL'
  for (let i = 0; i < 80; i++) view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0)
  view.setUint32(80, tris.length, true)

  let off = 84
  for (const t of tris) {
    view.setFloat32(off, t.nx, true)
    view.setFloat32(off + 4, t.ny, true)
    view.setFloat32(off + 8, t.nz, true)
    view.setFloat32(off + 12, t.ax, true)
    view.setFloat32(off + 16, t.ay, true)
    view.setFloat32(off + 20, t.az, true)
    view.setFloat32(off + 24, t.bx, true)
    view.setFloat32(off + 28, t.by, true)
    view.setFloat32(off + 32, t.bz, true)
    view.setFloat32(off + 36, t.cx, true)
    view.setFloat32(off + 40, t.cy, true)
    view.setFloat32(off + 44, t.cz, true)
    view.setUint16(off + 48, t.attr, true)
    off += 50
  }
  return buf
}

/** STL ASCII multi-solid — tiap part = solid terpisah (Split → parts di Bambu). */
export function partsToMultiSolidStlBuffer(parts) {
  const lines = []
  let idx = 0
  for (const part of meshExportParts(parts)) {
    const name = sanitizeSolidName(part.name || part.role || `part_${idx++}`)
    const geo = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry
    const pos = geo.attributes.position
    lines.push(`solid ${name}`)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i)
      b.fromBufferAttribute(pos, i + 1)
      c.fromBufferAttribute(pos, i + 2)
      const n = triangleNormal(a, b, c)
      lines.push(`  facet normal ${n.x} ${n.y} ${n.z}`)
      lines.push('    outer loop')
      lines.push(`      vertex ${a.x} ${a.y} ${a.z}`)
      lines.push(`      vertex ${b.x} ${b.y} ${b.z}`)
      lines.push(`      vertex ${c.x} ${c.y} ${c.z}`)
      lines.push('    endloop')
      lines.push('  endfacet')
    }
    lines.push(`endsolid ${name}`)
    if (geo !== part.geometry) geo.dispose()
  }
  if (!lines.length) throw new Error('Tidak ada mesh untuk export STL multi-part')
  return new TextEncoder().encode(`${lines.join('\n')}\n`).buffer
}

/** 3MF — objek terpisah + warna material (Bambu Studio / Orca Slicer). */
export function partsTo3mfBuffer(parts, modelName = 'Numa3D', options = {}) {
  const { assembly = true } = options
  const meshParts = meshExportParts(parts)
  if (!meshParts.length) throw new Error('Tidak ada mesh untuk export 3MF')

  const colorIndex = new Map()
  const baseEntries = []
  for (const part of meshParts) {
    const dc = hexToDisplayColor(part.color)
    if (!colorIndex.has(dc)) {
      colorIndex.set(dc, baseEntries.length)
      baseEntries.push({ name: `filament_${baseEntries.length + 1}`, displaycolor: dc })
    }
  }

  const materialsId = 1
  let nextObjectId = 2
  const meshObjectXml = []
  const meshObjectIds = []
  let partIdx = 0

  for (const part of meshParts) {
    const objectId = nextObjectId++
    meshObjectIds.push(objectId)
    const dc = hexToDisplayColor(part.color)
    const pindex = colorIndex.get(dc)
    const name = escapeXml(part.name || part.role || `part_${partIdx++}`)
    const { vertices, triangles } = geometryToMeshData(part.geometry)
    const vertXml = vertices
      .map((v) => `<vertex x="${v.x}" y="${v.y}" z="${v.z}"/>`)
      .join('')
    const triXml = triangles
      .map((t) => `<triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`)
      .join('')
    meshObjectXml.push(
      `<object id="${objectId}" pid="${materialsId}" pindex="${pindex}" type="model" name="${name}"><mesh><vertices>${vertXml}</vertices><triangles>${triXml}</triangles></mesh></object>`
    )
  }

  const objectXml = [...meshObjectXml]
  let buildObjectId = meshObjectIds[0]
  if (assembly && meshParts.length > 1) {
    const assemblyId = nextObjectId++
    buildObjectId = assemblyId
    const componentsXml = meshObjectIds.map((id) => `<component objectid="${id}"/>`).join('')
    objectXml.push(
      `<object id="${assemblyId}" type="model" name="${escapeXml(modelName)}"><components>${componentsXml}</components></object>`
    )
  }

  const baseXml = baseEntries
    .map((b) => `<base name="${escapeXml(b.name)}" displaycolor="${b.displaycolor}"/>`)
    .join('')

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Application">Numa3D Keychain</metadata>
  <metadata name="Title">${escapeXml(modelName)}</metadata>
  <resources>
    <basematerials id="${materialsId}">
      ${baseXml}
    </basematerials>
    ${objectXml.join('\n    ')}
  </resources>
  <build>
    <item objectid="${buildObjectId}"/>
  </build>
</model>`

  const enc = new TextEncoder()
  return createZip([
    {
      name: '[Content_Types].xml',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`)
    },
    {
      name: '_rels/.rels',
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`)
    },
    { name: '3D/3dmodel.model', data: enc.encode(modelXml) }
  ])
}

function partsToScene(parts, namePrefix = 'part') {
  const scene = new THREE.Scene()
  let i = 0
  for (const part of meshExportParts(parts)) {
    const mat = new THREE.MeshStandardMaterial({ color: part.color || '#888888' })
    const mesh = new THREE.Mesh(part.geometry, mat)
    mesh.name = part.name || part.role || `${namePrefix}_${i++}`
    scene.add(mesh)
  }
  if (!scene.children.length) throw new Error('Tidak ada mesh untuk export GLB')
  return scene
}

/** GLB dengan material warna per part. */
export function partsToGlbBuffer(parts) {
  const scene = partsToScene(parts)
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        scene.traverse((o) => o.material?.dispose())
        if (result instanceof ArrayBuffer) resolve(result)
        else reject(new Error('GLB export gagal'))
      },
      reject,
      { binary: true }
    )
  })
}

export const EXPORT_FORMATS = [
  { id: '3mf', label: '3MF (part terpisah + warna)', ext: '3mf', mime: 'model/3mf' },
  { id: 'stl-parts', label: 'STL multi-part (split di slicer)', ext: 'stl', mime: 'model/stl' },
  { id: 'glb', label: 'GLB (material)', ext: 'glb', mime: 'model/gltf-binary' },
  { id: 'stl-color', label: 'STL berwarna (PrusaSlicer)', ext: 'stl', mime: 'model/stl' },
  { id: 'stl', label: 'STL mono (1 warna / file)', ext: 'stl', mime: 'model/stl' }
]

export function exportFilename(slug, part, formatId) {
  const fmt = EXPORT_FORMATS.find((f) => f.id === formatId) || EXPORT_FORMATS[0]
  const suffix = part === 'text' ? 'text' : 'base'
  const tag =
    formatId === '3mf' || formatId === 'glb' || formatId === 'stl-color' || formatId === 'stl-parts'
      ? '_color'
      : ''
  return `${slug}_${suffix}${tag}.${fmt.ext}`
}

export function exportMime(formatId) {
  const fmt = EXPORT_FORMATS.find((f) => f.id === formatId) || EXPORT_FORMATS[0]
  return fmt.mime
}
