// Konversi opentype.js Path → THREE.Shape tanpa DOMParser (aman di Web Worker).
import * as THREE from 'three'

function mapY(y, flipBase) {
  return flipBase - y
}

/** Sama dengan transform SVG lama: scale(1,-1) translate(0, -y1-y2). */
export function opentypePathToShapes(otPath) {
  const commands = otPath?.commands
  if (!commands?.length) return []

  const bbox = otPath.getBoundingBox()
  const flipBase = -bbox.y1 - bbox.y2
  const shapePath = new THREE.ShapePath()

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        shapePath.moveTo(cmd.x, mapY(cmd.y, flipBase))
        break
      case 'L':
        shapePath.lineTo(cmd.x, mapY(cmd.y, flipBase))
        break
      case 'C':
        shapePath.bezierCurveTo(
          cmd.x1,
          mapY(cmd.y1, flipBase),
          cmd.x2,
          mapY(cmd.y2, flipBase),
          cmd.x,
          mapY(cmd.y, flipBase)
        )
        break
      case 'Q':
        shapePath.quadraticCurveTo(cmd.x1, mapY(cmd.y1, flipBase), cmd.x, mapY(cmd.y, flipBase))
        break
      case 'Z':
        shapePath.currentPath?.closePath()
        break
      default:
        break
    }
  }

  return shapePath.toShapes()
}
