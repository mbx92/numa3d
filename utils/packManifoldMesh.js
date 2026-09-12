// Compute crease normals through triangle adjacency, without rerunning a solid
// operation. Original vertex pairing (including coincident but separate shells)
// is preserved; only render vertices are split along sharp edges.
export function packManifoldMesh(mesh, creaseDegrees = 35) {
  const { vertProperties: verts, triVerts: triangles, numProp: stride } = mesh
  const vertexCount = verts.length / stride, cornerCount = triangles.length
  const vertices = Int32Array.from({ length: vertexCount }, (_, i) => i)
  const corners = Int32Array.from({ length: cornerCount }, (_, i) => i)
  function root(parents, i) {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i] }
    return i
  }
  function join(parents, a, b) {
    a = root(parents, a); b = root(parents, b)
    if (a !== b) parents[Math.max(a, b)] = Math.min(a, b)
  }
  for (let i = 0; i < mesh.mergeFromVert.length; i++) join(vertices, mesh.mergeFromVert[i], mesh.mergeToVert[i])
  for (let i = 0; i < vertexCount; i++) vertices[i] = root(vertices, i)

  const faceNormals = new Float64Array(cornerCount)
  for (let i = 0; i < cornerCount; i += 3) {
    const a = triangles[i] * stride, b = triangles[i + 1] * stride, c = triangles[i + 2] * stride
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2]
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz) || 1
    faceNormals[i] = nx / length; faceNormals[i + 1] = ny / length; faceNormals[i + 2] = nz / length
  }
  const nextCorner = (c) => c - c % 3 + (c + 1) % 3
  const edges = new Map(), cosine = Math.cos(creaseDegrees * Math.PI / 180)
  for (let c = 0; c < cornerCount; c++) {
    const n = nextCorner(c), a = vertices[triangles[c]], b = vertices[triangles[n]]
    const key = Math.min(a, b) * vertexCount + Math.max(a, b)
    const other = edges.get(key)
    if (other === undefined) { edges.set(key, c); continue }
    edges.delete(key)
    const f = c - c % 3, g = other - other % 3
    const dot = faceNormals[f] * faceNormals[g] + faceNormals[f + 1] * faceNormals[g + 1] + faceNormals[f + 2] * faceNormals[g + 2]
    if (dot >= cosine) {
      join(corners, c, nextCorner(other))
      join(corners, n, other)
    }
  }

  const positions = new Float32Array(cornerCount * 3), normals = new Float32Array(cornerCount * 3)
  const indices = new Uint32Array(cornerCount), groups = new Int32Array(cornerCount).fill(-1)
  const firstVertex = new Int32Array(vertexCount).fill(-1), mergeFromVert = [], mergeToVert = []
  let count = 0
  for (let c = 0; c < cornerCount; c++) {
    const group = root(corners, c), source = triangles[c], p = source * stride
    let index = groups[group]
    if (index === -1) {
      index = groups[group] = count++
      positions.set(verts.subarray(p, p + 3), index * 3)
      const canonical = vertices[source]
      if (firstVertex[canonical] === -1) firstVertex[canonical] = index
      else { mergeFromVert.push(index); mergeToVert.push(firstVertex[canonical]) }
    }
    indices[c] = index
    // Angle weighting prevents the diagonal of a quad from biasing its normals.
    const b = triangles[nextCorner(c)] * stride, d = triangles[nextCorner(nextCorner(c))] * stride
    const ux = verts[b] - verts[p], uy = verts[b + 1] - verts[p + 1], uz = verts[b + 2] - verts[p + 2]
    const vx = verts[d] - verts[p], vy = verts[d + 1] - verts[p + 1], vz = verts[d + 2] - verts[p + 2]
    const angle = Math.atan2(Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx), ux * vx + uy * vy + uz * vz)
    const f = c - c % 3
    for (let j = 0; j < 3; j++) normals[index * 3 + j] += faceNormals[f + j] * angle
  }
  for (let i = 0; i < count * 3; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length
  }
  return { positions: positions.slice(0, count * 3), normals: normals.slice(0, count * 3), indices,
    mergeFromVert: new Uint32Array(mergeFromVert), mergeToVert: new Uint32Array(mergeToVert) }
}
