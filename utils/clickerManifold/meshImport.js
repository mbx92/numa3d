import { meshBounds, parse3MF } from './threemfImport.js'

export const MESH_CLICKER_EXTENSIONS = ['3mf', 'stl']

export function meshFileExt(filename = '') {
  const parts = String(filename || '').toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() : ''
}

export function isMeshClickerFile(filenameOrFile) {
  const name = typeof filenameOrFile === 'string' ? filenameOrFile : filenameOrFile?.filename || filenameOrFile?.name || ''
  return MESH_CLICKER_EXTENSIONS.includes(meshFileExt(name))
}

function parseBinaryStl(buf) {
  const view = new DataView(buf)
  if (view.byteLength < 84) throw new Error('STL: file terlalu kecil')
  const triCount = view.getUint32(80, true)
  const expected = 84 + triCount * 50
  if (view.byteLength < expected) throw new Error('STL: data binary tidak lengkap')

  const verts = []
  const tris = []
  let offset = 84
  for (let i = 0; i < triCount; i++) {
    offset += 12 // skip normal
    const base = verts.length / 3
    for (let v = 0; v < 3; v++) {
      const x = view.getFloat32(offset, true)
      const y = view.getFloat32(offset + 4, true)
      const z = view.getFloat32(offset + 8, true)
      offset += 12
      verts.push(x, y, z)
    }
    tris.push(base, base + 1, base + 2)
    offset += 2 // attribute byte count
  }
  if (verts.length < 9) throw new Error('STL: mesh kosong')
  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3
  }
}

function parseAsciiStl(text) {
  const verts = []
  const tris = []
  const lines = String(text || '').split(/\r?\n/)
  let current = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.toLowerCase().startsWith('vertex')) continue
    const parts = line.split(/\s+/)
    const x = Number(parts[1])
    const y = Number(parts[2])
    const z = Number(parts[3])
    if (![x, y, z].every(Number.isFinite)) continue
    current.push(x, y, z)
    if (current.length === 9) {
      const base = verts.length / 3
      verts.push(...current)
      tris.push(base, base + 1, base + 2)
      current = []
    }
  }
  if (verts.length < 9) throw new Error('STL: mesh ASCII kosong')
  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3
  }
}

export function parseSTL(buf) {
  if (!(buf instanceof ArrayBuffer)) throw new Error('STL: buffer tidak valid')
  if (buf.byteLength < 84) throw new Error('STL: file terlalu kecil')

  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(80, buf.byteLength)))
  const looksAscii = /^\s*solid\b/i.test(head) && !/\0/.test(head)
  if (looksAscii) {
    try {
      return parseAsciiStl(new TextDecoder().decode(new Uint8Array(buf)))
    } catch {
      // fallback binary if header says solid but payload is binary
    }
  }
  return parseBinaryStl(buf)
}

/** Parse .3mf / .stl → indexed mesh (mm) untuk footprint & Manifold. */
export function parseMeshBuffer(buf, filename = '') {
  const ext = meshFileExt(filename)
  if (ext === 'stl') return parseSTL(buf)
  if (ext === '3mf' || !ext) return parse3MF(buf)
  throw new Error(`Format .${ext} belum didukung — gunakan .3mf atau .stl`)
}

export { meshBounds }

/** Sumbu terpanjang ≈ arah “berdiri” (figur/kaktus). */
export function detectMeshUpAxis(raw) {
  const b = meshBounds(raw)
  const axes = [
    { axis: 'x', size: b.width },
    { axis: 'y', size: b.depth },
    { axis: 'z', size: b.height }
  ]
  axes.sort((a, c) => c.size - a.size)
  return axes[0].axis
}

/**
 * Remap vertex agar +Z = atas (konvensi clicker/Manifold).
 * @param {'auto'|'x'|'y'|'z'} upAxis
 */
export function orientMeshToZUp(raw, upAxis = 'auto') {
  const axis = !upAxis || upAxis === 'auto' ? detectMeshUpAxis(raw) : upAxis
  if (axis === 'z') {
    return { raw, upAxis: 'z', remapped: false }
  }
  const vp = raw.vertProperties
  const np = raw.numProp || 3
  const out = new Float32Array(vp.length)
  for (let i = 0; i < vp.length; i += np) {
    const x = vp[i]
    const y = vp[i + 1]
    const z = vp[i + 2]
    let nx = x
    let ny = y
    let nz = z
    if (axis === 'y') {
      // Y-up (glTF/Blender) → Z-up
      nx = x
      ny = -z
      nz = y
    } else if (axis === 'x') {
      nx = -z
      ny = y
      nz = x
    }
    out[i] = nx
    out[i + 1] = ny
    out[i + 2] = nz
    for (let k = 3; k < np; k++) out[i + k] = vp[i + k]
  }
  return {
    raw: {
      vertProperties: out,
      triVerts: raw.triVerts instanceof Uint32Array ? raw.triVerts : new Uint32Array(raw.triVerts),
      numProp: np
    },
    upAxis: axis,
    remapped: true
  }
}

/** Parse + orient ke Z-up. */
export function parseMeshBufferOriented(buf, filename = '', upAxis = 'auto') {
  const parsed = parseMeshBuffer(buf, filename)
  return orientMeshToZUp(parsed, upAxis)
}

/** Serialize indexed mesh → binary STL ArrayBuffer (untuk mode dual otomatis). */
export function rawMeshToStlBuffer(raw) {
  const vp = raw.vertProperties
  const np = raw.numProp || 3
  const tris = raw.triVerts
  const triCount = tris.length / 3
  const buf = new ArrayBuffer(84 + triCount * 50)
  const view = new DataView(buf)
  const head = new TextEncoder().encode('numa3d-mesh-split')
  new Uint8Array(buf, 0, 80).set(head.subarray(0, Math.min(80, head.length)))
  view.setUint32(80, triCount, true)
  let offset = 84
  for (let t = 0; t < triCount; t++) {
    const i0 = tris[t * 3] * np
    const i1 = tris[t * 3 + 1] * np
    const i2 = tris[t * 3 + 2] * np
    const ax = vp[i0]
    const ay = vp[i0 + 1]
    const az = vp[i0 + 2]
    const bx = vp[i1]
    const by = vp[i1 + 1]
    const bz = vp[i1 + 2]
    const cx = vp[i2]
    const cy = vp[i2 + 1]
    const cz = vp[i2 + 2]
    const ux = bx - ax
    const uy = by - ay
    const uz = bz - az
    const vx = cx - ax
    const vy = cy - ay
    const vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    view.setFloat32(offset, nx, true)
    view.setFloat32(offset + 4, ny, true)
    view.setFloat32(offset + 8, nz, true)
    view.setFloat32(offset + 12, ax, true)
    view.setFloat32(offset + 16, ay, true)
    view.setFloat32(offset + 20, az, true)
    view.setFloat32(offset + 24, bx, true)
    view.setFloat32(offset + 28, by, true)
    view.setFloat32(offset + 32, bz, true)
    view.setFloat32(offset + 36, cx, true)
    view.setFloat32(offset + 40, cy, true)
    view.setFloat32(offset + 44, cz, true)
    view.setUint16(offset + 48, 0, true)
    offset += 50
  }
  return buf
}

/** Unduh file galeri sebagai ArrayBuffer (andal untuk stream response). */
export async function fetchLibraryMeshBuffer(id) {
  const res = await fetch(`/api/library-files/${Number(id)}`, { credentials: 'include' })
  if (!res.ok) {
    let message = `Gagal unduh file galeri (${res.status})`
    try {
      const body = await res.json()
      if (body?.statusMessage) message = body.statusMessage
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.arrayBuffer()
}
