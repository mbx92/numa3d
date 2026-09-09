// Serialisasi BufferGeometry untuk Web Worker (shared keychain / clicker / lightbox).
import * as THREE from 'three'

/** Pastikan triangle soup non-indexed sebelum pack — Manifold mesh pakai index. */
function toTriangleSoup(geo) {
  if (!geo?.index) return geo
  const next = geo.toNonIndexed()
  return next
}

export function packGeometry(geo) {
  const soup = toTriangleSoup(geo)
  const owned = soup !== geo
  const pos = soup.attributes.position
  const norm = soup.attributes.normal
  const packed = {
    positions: new Float32Array(pos.array),
    normals: norm ? new Float32Array(norm.array) : null
  }
  if (owned) soup.dispose()
  return packed
}

export function unpackGeometry(data) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  if (data.indices?.length) geo.setIndex(new THREE.BufferAttribute(data.indices, 1))
  if (data.normals) geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3))
  else geo.computeVertexNormals()
  return geo
}
