import * as THREE from 'three'
import ClipperLib from 'clipper-lib'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

// Normalize in SVG units before the generator scales to millimetres. A relative
// grid preserves tiny viewBoxes as well as large exports from drawing programs.
export function svgContoursToShapes(contours, fillRule = 'nonzero') {
  const points = contours.flat()
  if (!points.length) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error('Koordinat SVG tidak valid')
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const span = Math.max(maxX - minX, maxY - minY)
  if (span <= 0) return []
  const scale = 1e6 / span
  const paths = contours.map((ring) => ring.map((p) => ({
    X: Math.round((p.x - minX) * scale), Y: Math.round((p.y - minY) * scale)
  })))
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true)
  const tree = new ClipperLib.PolyTree()
  const rule = fillRule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero
  clipper.Execute(ClipperLib.ClipType.ctUnion, tree, rule, rule)
  const shapes = []
  const toPoints = (node) => node.Contour().map((p) => new THREE.Vector2(p.X / scale + minX, p.Y / scale + minY))
  const visit = (node) => {
    if (node.Contour().length && !node.IsHole()) {
      const shape = new THREE.Shape(toPoints(node))
      shape.closePath()
      for (const child of node.Childs()) {
        if (!child.IsHole()) continue
        const hole = new THREE.Path(toPoints(child))
        hole.closePath()
        shape.holes.push(hole)
      }
      shapes.push(shape)
    }
    node.Childs().forEach(visit)
  }
  visit(tree)
  return shapes
}

export function svgFillShapes(path) {
  // Resolve crossings and fill-rule together, including overlapping subpaths
  // and self-intersections that a nesting-only shape conversion cannot handle.
  return svgContoursToShapes(path.subPaths.map((p) => p.getPoints(48)), path.userData?.style?.fillRule)
}

export function svgStrokeShapes(path) {
  const style = { ...path.userData.style }
  const transform = path.userData.transform || new THREE.Matrix3()
  const scale = Math.sqrt(Math.abs(transform.determinant()))
  if (scale < 1e-12) return []
  const inverse = transform.clone().invert()
  // Outline strokes in local coordinates, then transform the outline. This
  // also preserves width under non-uniform scale, reflection and skew.
  style.strokeWidth /= scale
  const contours = []
  for (const subPath of path.subPaths) {
    const points = subPath.getPoints(48).map((p) => p.applyMatrix3(inverse))
    if (subPath.autoClose && points.length && !points[0].equals(points.at(-1))) points.push(points[0].clone())
    const geo = SVGLoader.pointsToStroke(points, style, 24)
    if (!geo) continue
    try {
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i += 3) {
        const triangle = [0, 1, 2].map((j) => new THREE.Vector2(pos.getX(i + j), pos.getY(i + j)).applyMatrix3(transform))
        if (THREE.ShapeUtils.isClockWise(triangle)) triangle.reverse()
        contours.push(triangle)
      }
    } finally {
      geo.dispose()
    }
  }
  return svgContoursToShapes(contours)
}
