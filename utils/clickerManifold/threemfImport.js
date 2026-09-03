// Parse .3mf → indexed mesh (mm). Aman di Web Worker — fflate + regex.
import { unzipSync, strFromU8 } from 'fflate'

const UNIT_TO_MM = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000
}

export function parse3MF(buf) {
  const files = unzipSync(new Uint8Array(buf))
  const modelKeys = Object.keys(files)
    .filter((k) => k.toLowerCase().endsWith('.model'))
    .sort((a, b) => {
      const aa = a.toLowerCase().endsWith('3dmodel.model') ? 0 : 1
      const bb = b.toLowerCase().endsWith('3dmodel.model') ? 0 : 1
      return aa - bb
    })
  if (!modelKeys.length) throw new Error('3MF: missing .model file')

  const readAttrs = (text) => {
    const attrs = {}
    const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let match
    while ((match = re.exec(text))) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? ''
    }
    return attrs
  }

  const readFloat = (attrs, key) => {
    const value = Number.parseFloat(attrs[key])
    return Number.isFinite(value) ? value : null
  }

  const readInt = (attrs, key) => {
    const value = Number.parseInt(attrs[key], 10)
    return Number.isFinite(value) ? value : null
  }

  const countTags = (xml, name) => {
    const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b`, 'gi')
    return xml.match(re)?.length || 0
  }

  const appendGlobalMesh = (xml, scale, verts, tris) => {
    const vertexOffset = verts.length / 3
    let meshVertexCount = 0
    const vertexRe = /<(?:[\w-]+:)?vertex\b([^>]*)\/?>/gi
    let vertexMatch
    while ((vertexMatch = vertexRe.exec(xml))) {
      const attrs = readAttrs(vertexMatch[1])
      const x = readFloat(attrs, 'x')
      const y = readFloat(attrs, 'y')
      const z = readFloat(attrs, 'z')
      if (x === null || y === null || z === null) continue
      verts.push(x * scale, y * scale, z * scale)
      meshVertexCount++
    }

    const triRe = /<(?:[\w-]+:)?triangle\b([^>]*)\/?>/gi
    let triMatch
    while ((triMatch = triRe.exec(xml))) {
      const attrs = readAttrs(triMatch[1])
      const v1 = readInt(attrs, 'v1')
      const v2 = readInt(attrs, 'v2')
      const v3 = readInt(attrs, 'v3')
      if (v1 === null || v2 === null || v3 === null) continue
      if (v1 >= meshVertexCount || v2 >= meshVertexCount || v3 >= meshVertexCount) continue
      tris.push(vertexOffset + v1, vertexOffset + v2, vertexOffset + v3)
    }
  }

  const verts = []
  const tris = []
  const diagnostics = []
  for (const key of modelKeys) {
    const xml = strFromU8(files[key])
    const modelTag = xml.match(/<(?:[\w-]+:)?model\b([^>]*)>/i)?.[1] || ''
    const unit = (readAttrs(modelTag).unit || 'millimeter').toLowerCase()
    const s = UNIT_TO_MM[unit] ?? 1
    const beforeVerts = verts.length
    const beforeTris = tris.length
    const meshCount = countTags(xml, 'mesh')
    const vertexTagCount = countTags(xml, 'vertex')
    const triangleTagCount = countTags(xml, 'triangle')
    const objectCount = countTags(xml, 'object')
    const componentCount = countTags(xml, 'component')

    const meshRe = /<(?:[\w-]+:)?mesh\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?mesh>/gi
    let meshMatch
    while ((meshMatch = meshRe.exec(xml))) {
      const meshXml = meshMatch[1]
      const vertexOffset = verts.length / 3
      let meshVertexCount = 0

      const vertexRe = /<(?:[\w-]+:)?vertex\b([^>]*)\/?>/gi
      let vertexMatch
      while ((vertexMatch = vertexRe.exec(meshXml))) {
        const attrs = readAttrs(vertexMatch[1])
        const x = readFloat(attrs, 'x')
        const y = readFloat(attrs, 'y')
        const z = readFloat(attrs, 'z')
        if (x === null || y === null || z === null) continue
        verts.push(x * s, y * s, z * s)
        meshVertexCount++
      }

      const triRe = /<(?:[\w-]+:)?triangle\b([^>]*)\/?>/gi
      let triMatch
      while ((triMatch = triRe.exec(meshXml))) {
        const attrs = readAttrs(triMatch[1])
        const v1 = readInt(attrs, 'v1')
        const v2 = readInt(attrs, 'v2')
        const v3 = readInt(attrs, 'v3')
        if (v1 === null || v2 === null || v3 === null) continue
        if (v1 >= meshVertexCount || v2 >= meshVertexCount || v3 >= meshVertexCount) continue
        tris.push(vertexOffset + v1, vertexOffset + v2, vertexOffset + v3)
      }
    }

    if (verts.length === beforeVerts && tris.length === beforeTris && vertexTagCount && triangleTagCount) {
      appendGlobalMesh(xml, s, verts, tris)
    }

    diagnostics.push(
      `${key}: objects=${objectCount}, mesh=${meshCount}, components=${componentCount}, vertexTags=${vertexTagCount}, triangleTags=${triangleTagCount}`
    )
  }

  if (verts.length < 9 || tris.length < 3) {
    throw new Error(`3MF: mesh kosong (${diagnostics.join(' | ')})`)
  }
  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3
  }
}

/**
 * Parse tiap <mesh> sebagai body terpisah (untuk auto lid/base).
 * Jika hanya 1 mesh, arrays.length === 1.
 */
export function parse3MFMeshes(buf) {
  const files = unzipSync(new Uint8Array(buf))
  const modelKeys = Object.keys(files)
    .filter((k) => k.toLowerCase().endsWith('.model'))
    .sort((a, b) => {
      const aa = a.toLowerCase().endsWith('3dmodel.model') ? 0 : 1
      const bb = b.toLowerCase().endsWith('3dmodel.model') ? 0 : 1
      return aa - bb
    })
  if (!modelKeys.length) throw new Error('3MF: missing .model file')

  const readAttrs = (text) => {
    const attrs = {}
    const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let match
    while ((match = re.exec(text))) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? ''
    }
    return attrs
  }
  const readFloat = (attrs, key) => {
    const value = Number.parseFloat(attrs[key])
    return Number.isFinite(value) ? value : null
  }
  const readInt = (attrs, key) => {
    const value = Number.parseInt(attrs[key], 10)
    return Number.isFinite(value) ? value : null
  }

  const meshes = []
  for (const key of modelKeys) {
    const xml = strFromU8(files[key])
    const modelTag = xml.match(/<(?:[\w-]+:)?model\b([^>]*)>/i)?.[1] || ''
    const unit = (readAttrs(modelTag).unit || 'millimeter').toLowerCase()
    const s = UNIT_TO_MM[unit] ?? 1

    const meshRe = /<(?:[\w-]+:)?mesh\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?mesh>/gi
    let meshMatch
    while ((meshMatch = meshRe.exec(xml))) {
      const meshXml = meshMatch[1]
      const verts = []
      const tris = []
      const vertexRe = /<(?:[\w-]+:)?vertex\b([^>]*)\/?>/gi
      let vertexMatch
      while ((vertexMatch = vertexRe.exec(meshXml))) {
        const attrs = readAttrs(vertexMatch[1])
        const x = readFloat(attrs, 'x')
        const y = readFloat(attrs, 'y')
        const z = readFloat(attrs, 'z')
        if (x === null || y === null || z === null) continue
        verts.push(x * s, y * s, z * s)
      }
      const nVerts = verts.length / 3
      const triRe = /<(?:[\w-]+:)?triangle\b([^>]*)\/?>/gi
      let triMatch
      while ((triMatch = triRe.exec(meshXml))) {
        const attrs = readAttrs(triMatch[1])
        const v1 = readInt(attrs, 'v1')
        const v2 = readInt(attrs, 'v2')
        const v3 = readInt(attrs, 'v3')
        if (v1 === null || v2 === null || v3 === null) continue
        if (v1 >= nVerts || v2 >= nVerts || v3 >= nVerts) continue
        tris.push(v1, v2, v3)
      }
      if (verts.length >= 9 && tris.length >= 3) {
        meshes.push({
          vertProperties: new Float32Array(verts),
          triVerts: new Uint32Array(tris),
          numProp: 3
        })
      }
    }
  }

  if (!meshes.length) {
    // Fallback: combined parse
    return { meshes: [parse3MF(buf)] }
  }
  return { meshes }
}

export function meshBounds(raw) {
  const vp = raw?.vertProperties || []
  const np = raw?.numProp || 3
  const b = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  }
  for (let i = 0; i < vp.length; i += np) {
    const x = vp[i]
    const y = vp[i + 1]
    const z = vp[i + 2]
    b.minX = Math.min(b.minX, x)
    b.maxX = Math.max(b.maxX, x)
    b.minY = Math.min(b.minY, y)
    b.maxY = Math.max(b.maxY, y)
    b.minZ = Math.min(b.minZ, z)
    b.maxZ = Math.max(b.maxZ, z)
  }
  if (!isFinite(b.minX)) throw new Error('Mesh kosong')
  b.width = b.maxX - b.minX
  b.depth = b.maxY - b.minY
  b.height = b.maxZ - b.minZ
  b.centerX = (b.minX + b.maxX) / 2
  b.centerY = (b.minY + b.maxY) / 2
  b.centerZ = (b.minZ + b.maxZ) / 2
  return b
}
