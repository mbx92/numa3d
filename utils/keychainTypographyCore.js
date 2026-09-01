/** Bounds helper — dipakai typography layout & keychainCore. */
export function computeBoundsFromShapes(shapes) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const shape of shapes) {
    for (const p of shape.getPoints(10)) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}
