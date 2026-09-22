const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })

// Validate geometry before accepting a job; STL carries no print settings or colors.
export function validateStl(bytes, { maxBytes = 40 * 1024 * 1024 } = {}) {
  if (!bytes?.length || bytes.length > maxBytes) throw invalid(`File STL wajib disertakan, maksimal ${Math.floor(maxBytes / 1024 / 1024)} MB`)
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  let triangles = 0
  const vertex = (values) => values.forEach((value, axis) => {
    if (!Number.isFinite(value)) throw invalid('Koordinat STL tidak valid')
    min[axis] = Math.min(min[axis], value)
    max[axis] = Math.max(max[axis], value)
  })
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = bytes.length >= 84 ? view.getUint32(80, true) : 0
  if (count > 0 && 84 + count * 50 === bytes.length) {
    triangles = count
    for (let i = 0; i < count; i++) {
      for (let v = 0; v < 3; v++) {
        const offset = 84 + i * 50 + 12 + v * 12
        vertex([0, 4, 8].map((axis) => view.getFloat32(offset + axis, true)))
      }
    }
  } else {
    const text = new TextDecoder().decode(bytes).trim()
    const solid = text.match(/^solid[^\r\n]*\r?\n([\s\S]*?)\bendsolid[^\r\n]*$/)
    if (!solid) throw invalid('Format file STL tidak valid')
    const n = '([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)'
    const xyz = `${n}\\s+${n}\\s+${n}`
    const facet = new RegExp(`\\s*facet\\s+normal\\s+${xyz}\\s+outer\\s+loop\\s+vertex\\s+${xyz}\\s+vertex\\s+${xyz}\\s+vertex\\s+${xyz}\\s+endloop\\s+endfacet\\s*`, 'gy')
    let offset = 0, match
    while ((match = facet.exec(solid[1]))) {
      for (let i = 4; i <= 10; i += 3) vertex(match.slice(i, i + 3).map(Number))
      triangles++
      offset = facet.lastIndex
    }
    if (!triangles || solid[1].slice(offset).trim()) throw invalid('Mesh STL tidak lengkap atau tidak valid')
  }
  const size = max.map((value, axis) => value - min[axis])
  if (size.some((value) => !Number.isFinite(value) || value <= 0)) throw invalid('STL harus berisi model 3D dengan ukuran valid')
  if (size.some((value) => value > 260)) throw invalid('Ukuran STL melebihi area cetak Kobra X 260 × 260 × 260 mm')
  return { triangles, size }
}
