// Manifold extrusion for keychain trays and inserts. 2D layout stays in
// keychainCore (font, typography, Clipper silhouette); this file only builds solids.
import * as THREE from 'three'
import { adaptiveRingSegments, shapesToRings } from './clickerManifold/meshUtils.js'

function copyMeshGeometry(mesh) {
  const stride = mesh.numProp || 3
  const count = mesh.vertProperties.length / stride
  const positions = new Float32Array(count * 3)
  const normals = stride >= 6 ? new Float32Array(count * 3) : null
  for (let i = 0; i < count; i++) {
    positions[i * 3] = mesh.vertProperties[i * stride]
    positions[i * 3 + 1] = mesh.vertProperties[i * stride + 1]
    positions[i * 3 + 2] = mesh.vertProperties[i * stride + 2]
    if (normals) {
      normals[i * 3] = mesh.vertProperties[i * stride + 3]
      normals[i * 3 + 1] = mesh.vertProperties[i * stride + 4]
      normals[i * 3 + 2] = mesh.vertProperties[i * stride + 5]
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1))
  if (normals) geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  else geo.computeVertexNormals()
  return geo
}

function normalsUsable(geo) {
  const n = geo.attributes.normal
  if (!n?.count) return false
  for (let i = 0; i < n.count; i++) {
    if (Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) < 0.5) return false
  }
  return true
}

export function createKeychainKernel(wasm) {
  const owned = new Set()
  const sections = new Set()
  const { Manifold, CrossSection } = wasm

  function track(solid) {
    owned.add(solid)
    return solid
  }
  function trackSection(section) {
    sections.add(section)
    return section
  }

  function fromShapes(shapes) {
    const list = (shapes || []).filter(Boolean)
    if (!list.length) throw new Error('Profil 2D kosong')
    const segs = adaptiveRingSegments(list, 24, 96, 0.35)
    const rings = shapesToRings(list, segs).filter((ring) => ring.length >= 3)
    if (!rings.length) throw new Error('Profil 2D kosong')
    const cs = trackSection(new CrossSection(rings, 'NonZero'))
    if (typeof cs.isEmpty === 'function' && cs.isEmpty()) throw new Error('Profil 2D kosong')
    return cs
  }

  function extrude(shapes, height, z = 0) {
    const cs = fromShapes(shapes)
    let solid = track(Manifold.extrude(cs, Math.max(0.01, height)))
    if (Math.abs(z) > 1e-9) solid = track(solid.translate([0, 0, z]))
    if (solid.status() !== 'NoError') throw new Error(`Geometri gagal: ${solid.status()}`)
    if (!solid.numTri() || solid.volume() <= 0.000001) {
      throw new Error('Hasil kosong atau tidak memiliki volume. Periksa ukuran huruf atau cavity.')
    }
    return solid
  }

  function unionAll(solids) {
    const list = solids.filter(Boolean)
    if (!list.length) throw new Error('Geometry merge kosong')
    if (list.length === 1) return list[0]
    const solid = track(Manifold.union(list))
    if (solid.status() !== 'NoError') throw new Error(`Geometri gagal: ${solid.status()}`)
    return solid
  }

  function subtract(a, b) {
    const solid = track(a.subtract(b))
    if (solid.status() !== 'NoError') throw new Error(`Geometri gagal: ${solid.status()}`)
    if (!solid.numTri() || solid.volume() <= 0.000001) {
      throw new Error('Hasil kosong atau tidak memiliki volume. Periksa ukuran huruf atau cavity.')
    }
    return solid
  }

  function toGeometry(solid) {
    const shaded = track(solid.calculateNormals(0, 35))
    const geo = copyMeshGeometry(shaded.getMesh())
    if (!normalsUsable(geo)) geo.computeVertexNormals()
    return geo
  }

  function dispose() {
    for (const solid of [...owned].reverse()) {
      try { solid.delete() } catch { /* already freed */ }
    }
    for (const section of sections) {
      try { section.delete() } catch { /* already freed */ }
    }
    owned.clear()
    sections.clear()
  }

  return { extrude, unionAll, subtract, toGeometry, dispose }
}
