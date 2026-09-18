export const DEFAULT_BUILD_VOLUME = Object.freeze({ width: 220, depth: 220, height: 250 })

function positiveMm(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export function machineBuildVolume(machine) {
  return {
    width: positiveMm(machine?.bedWidthMm, DEFAULT_BUILD_VOLUME.width),
    depth: positiveMm(machine?.bedDepthMm, DEFAULT_BUILD_VOLUME.depth),
    height: positiveMm(machine?.buildHeightMm, DEFAULT_BUILD_VOLUME.height)
  }
}

export function modelFitsBuildVolume(bounds, volume) {
  if (!bounds || !volume) return true
  const width = positiveMm(volume.width, DEFAULT_BUILD_VOLUME.width)
  const depth = positiveMm(volume.depth, DEFAULT_BUILD_VOLUME.depth)
  const height = positiveMm(volume.height, DEFAULT_BUILD_VOLUME.height)
  const epsilon = 0.05
  return (
    Number(bounds.min?.x) >= -width / 2 - epsilon &&
    Number(bounds.max?.x) <= width / 2 + epsilon &&
    Number(bounds.min?.z) >= -depth / 2 - epsilon &&
    Number(bounds.max?.z) <= depth / 2 + epsilon &&
    Number(bounds.min?.y) >= -epsilon &&
    Number(bounds.max?.y) <= height + epsilon
  )
}

export function printFileUsesZUp(filename) {
  const extension = String(filename || '').split('.').pop()?.toLowerCase()
  return extension === 'stl' || extension === 'obj' || extension === '3mf'
}
