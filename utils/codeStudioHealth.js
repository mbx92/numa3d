/**
 * Inspect exported Float32 topology. Exact welding preserves intentional gaps.
 * @param {{ positions: Float32Array, indices: Uint32Array }} geometry
 */
export function inspectMesh({ positions, indices }) {
  if (!positions?.length || positions.length % 3 || !indices?.length || indices.length % 3) throw new Error('Mesh kosong atau buffer tidak valid')
  const vertices = new Map(), welded = new Uint32Array(positions.length / 3)
  for (let i = 0; i < welded.length; i++) {
    const p = positions.subarray(i * 3, i * 3 + 3)
    if (!p.every(Number.isFinite)) throw new Error('Mesh memiliki vertex tidak finite')
    const key = `${p[0]},${p[1]},${p[2]}`
    if (!vertices.has(key)) vertices.set(key, vertices.size)
    welded[i] = vertices.get(key)
  }
  const count = indices.length / 3, parent = Uint32Array.from({ length: count }, (_, i) => i)
  function root(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  const edges = new Map(), volumes = new Float64Array(count), faces = new Set()
  let degenerateTriangles = 0, duplicateTriangles = 0
  // Subtract a common origin to avoid cancellation for models far from zero.
  const ox = positions[0], oy = positions[1], oz = positions[2]
  for (let face = 0; face < count; face++) {
    const ids = [indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]]
    if (ids.some((i) => !Number.isInteger(i) || i < 0 || i >= welded.length)) throw new Error('Index mesh di luar vertex')
    const [a, b, c] = ids.map((i) => welded[i])
    const key = [a, b, c].sort((x, y) => x - y).join(',')
    if (faces.has(key)) duplicateTriangles++
    faces.add(key)
    const [ia, ib, ic] = ids.map((i) => i * 3)
    const ax = positions[ia] - ox, ay = positions[ia + 1] - oy, az = positions[ia + 2] - oz
    const bx = positions[ib] - positions[ia], by = positions[ib + 1] - positions[ia + 1], bz = positions[ib + 2] - positions[ia + 2]
    const cx = positions[ic] - positions[ia], cy = positions[ic + 1] - positions[ia + 1], cz = positions[ic + 2] - positions[ia + 2]
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx
    if (a === b || b === c || c === a || Math.hypot(nx, ny, nz) === 0) degenerateTriangles++
    volumes[face] = (ax * nx + ay * ny + az * nz) / 6
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const edgeKey = `${Math.min(u, v)},${Math.max(u, v)}`
      const edge = edges.get(edgeKey)
      if (edge) {
        edge.count++; edge.orientation += u < v ? 1 : -1
        parent[root(face)] = root(edge.face)
      } else edges.set(edgeKey, { count: 1, orientation: u < v ? 1 : -1, face })
    }
  }
  let boundaryEdges = 0, nonManifoldEdges = 0, inconsistentEdges = 0
  for (const edge of edges.values()) {
    if (edge.count === 1) boundaryEdges++
    if (edge.count > 2) nonManifoldEdges++
    if (edge.count === 2 && edge.orientation !== 0) inconsistentEdges++
  }
  const shells = new Map(), vertexShell = new Map(), pinched = new Set()
  for (let face = 0; face < count; face++) {
    const component = root(face)
    shells.set(component, (shells.get(component) || 0) + volumes[face])
    for (let j = 0; j < 3; j++) {
      const v = welded[indices[face * 3 + j]]
      if (vertexShell.has(v) && vertexShell.get(v) !== component) pinched.add(v)
      vertexShell.set(v, component)
    }
  }
  const closed = !(boundaryEdges || nonManifoldEdges || inconsistentEdges || degenerateTriangles || duplicateTriangles || pinched.size)
  const components = [...shells.values()].filter((v) => v > 0).length
  const warnings = []
  if (!closed) warnings.push('Mesh memiliki masalah topologi; periksa sambungan atau ukuran fitur.')
  if (components > 1) warnings.push(`${components} bagian solid terpisah; periksa apakah disengaja.`)
  if ([...shells.values()].some((v) => Math.abs(v) <= 0.000001)) warnings.push('Ada fragmen dengan volume mendekati nol.')
  return {
    status: warnings.length ? 'warnings' : 'closed', closed, components, shells: shells.size,
    boundaryEdges, nonManifoldEdges, inconsistentEdges, degenerateTriangles, duplicateTriangles,
    pinchedVertices: pinched.size, triangles: count, vertices: vertices.size, warnings,
    unchecked: ['self-intersections', 'wall-thickness', 'supports', 'printer-tolerances']
  }
}
