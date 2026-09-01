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
  const key = Object.keys(files).find((k) => k.toLowerCase().endsWith('3dmodel.model'))
  if (!key) throw new Error('3MF: missing 3D/3dmodel.model')
  const xml = strFromU8(files[key])

  const unit = (xml.match(/<model[^>]*\bunit="([^"]+)"/)?.[1] ?? 'millimeter').toLowerCase()
  const s = UNIT_TO_MM[unit] ?? 1

  const verts = []
  const vre = /<vertex\s+x="(-?[\d.eE+-]+)"\s+y="(-?[\d.eE+-]+)"\s+z="(-?[\d.eE+-]+)"/g
  let m
  while ((m = vre.exec(xml))) {
    verts.push(parseFloat(m[1]) * s, parseFloat(m[2]) * s, parseFloat(m[3]) * s)
  }

  const tris = []
  const tre = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g
  while ((m = tre.exec(xml))) {
    tris.push(+m[1], +m[2], +m[3])
  }

  if (verts.length < 9 || tris.length < 3) throw new Error('3MF: mesh kosong')
  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3
  }
}
