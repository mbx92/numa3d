import * as THREE from 'three'

export const PRINT_PLATE = Object.freeze({ width: 260, depth: 260, height: 260, margin: 5, gap: 6 })

// Each group is one printable object. Keep its color volumes together throughout.
export function layoutPrintGroups(groups, plate = PRINT_PLATE) {
  const { width, depth, height, margin, gap } = plate
  if (![width, depth, height, margin, gap].every(Number.isFinite) ||
      width <= margin * 2 || depth <= margin * 2 || height <= 0 || margin < 0 || gap < 0) {
    throw new Error('Ukuran plate tidak valid')
  }
  const prepared = []
  try {
    for (const group of groups) {
      const parts = (group.parts || []).filter((p) => !p.line && !p.previewOnly && p.geometry?.attributes?.position?.count)
        .map((part) => ({ ...part, geometry: part.geometry.clone() }))
      if (!parts.length) continue
      const entry = { ...group, parts, box: new THREE.Box3() }
      prepared.push(entry)
      for (const part of parts) {
        if (group.faceDown) part.geometry.rotateX(Math.PI)
        part.geometry.computeBoundingBox()
        entry.box.union(part.geometry.boundingBox)
      }
      const size = entry.box.getSize(new THREE.Vector3())
      if (![size.x, size.y, size.z, entry.box.min.x, entry.box.min.y, entry.box.min.z].every(Number.isFinite)) {
        throw new Error(`Geometri ${group.name} tidak valid`)
      }
      if (size.z > height + 0.0001) throw new Error(`${group.name} melebihi tinggi cetak ${height} mm`)
      entry.width = size.x
      entry.depth = size.y
    }
    if (!prepared.length) throw new Error('Tidak ada model untuk export plate')

    const ordered = [...prepared].sort((a, b) => b.width * b.depth - a.width * a.depth)
    // Small generator assemblies (2–3 objects): try corners and quarter turns,
    // backtracking so a long lid does not block a layout that would otherwise fit.
    function pack(index, placed) {
      if (index === ordered.length) return placed
      const entry = ordered[index]
      const xs = [...new Set([margin, ...placed.map((p) => p.x + p.w + gap)])].sort((a, b) => a - b)
      const ys = [...new Set([margin, ...placed.map((p) => p.y + p.d + gap)])].sort((a, b) => a - b)
      for (const rotated of [false, true]) {
        const w = rotated ? entry.depth : entry.width
        const d = rotated ? entry.width : entry.depth
        for (const y of ys) for (const x of xs) {
          if (x + w > width - margin + 0.0001 || y + d > depth - margin + 0.0001) continue
          if (placed.some((p) => x < p.x + p.w + gap - 0.0001 && x + w + gap > p.x + 0.0001 &&
            y < p.y + p.d + gap - 0.0001 && y + d + gap > p.y + 0.0001)) continue
          const result = pack(index + 1, [...placed, { entry, x, y, w, d, rotated }])
          if (result) return result
        }
      }
      return null
    }
    const placements = pack(0, [])
    if (!placements) throw new Error(`Model tidak muat di plate ${width} × ${depth} mm (margin ${margin} mm, jarak ${gap} mm). Ekspor per bagian atau kecilkan ukuran desain.`)
    const dx = (width - Math.max(...placements.map((p) => p.x + p.w)) - margin) / 2
    const dy = (depth - Math.max(...placements.map((p) => p.y + p.d)) - margin) / 2
    for (const p of placements) {
      const box = new THREE.Box3()
      for (const part of p.entry.parts) {
        if (p.rotated) part.geometry.rotateZ(Math.PI / 2)
        part.geometry.computeBoundingBox()
        box.union(part.geometry.boundingBox)
      }
      for (const part of p.entry.parts) part.geometry.translate(p.x + dx - box.min.x, p.y + dy - box.min.y, -box.min.z)
    }
    return prepared
  } catch (error) {
    for (const group of prepared) for (const part of group.parts) part.geometry.dispose()
    throw error
  }
}
