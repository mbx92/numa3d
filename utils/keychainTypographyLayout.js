import * as THREE from 'three'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { resolveGroupTypography } from './keychainTypography.js'

function mapShapePoints(shape, fn) {
  const pts = shape.getPoints(10)
  const next = new THREE.Shape()
  pts.forEach((p, i) => {
    const tp = fn(p.x, p.y)
    if (i === 0) next.moveTo(tp.x, tp.y)
    else next.lineTo(tp.x, tp.y)
  })
  next.closePath()
  for (const hole of shape.holes || []) {
    const hp = hole.getPoints(10)
    const ring = new THREE.Path()
    hp.forEach((p, i) => {
      const tp = fn(p.x, p.y)
      if (i === 0) ring.moveTo(tp.x, tp.y)
      else ring.lineTo(tp.x, tp.y)
    })
    ring.closePath()
    next.holes.push(ring)
  }
  return next
}

function transformGroup(group, fn) {
  return {
    ...group,
    shapes: group.shapes.map((shape) => mapShapePoints(shape, fn))
  }
}

function transformGroupAround(group, cx, cy, fn) {
  return transformGroup(group, (x, y) => fn(x - cx, y - cy, cx, cy))
}

/** Geser huruf agar tidak overlap setelah aksen diperbesar. */
export function reflowGroups(groups, minGapMm = 0.12) {
  if (groups.length < 2) return groups
  const out = [groups[0]]
  for (let i = 1; i < groups.length; i++) {
    const prevB = computeBoundsFromShapes(out[i - 1].shapes)
    const curB = computeBoundsFromShapes(groups[i].shapes)
    const gap = curB.minX - prevB.maxX
    if (gap < minGapMm) {
      const dx = minGapMm - gap
      out.push(transformGroup(groups[i], (x, y) => ({ x: x + dx, y })))
    } else {
      out.push(groups[i])
    }
  }
  return out
}

/** Skala grup agar muat dalam kotak target setelah transform typography. */
export function scaleGroupsToFit(groups, bounds, targetW, targetH) {
  if (!groups.length) return groups
  if (bounds.width <= targetW * 1.001 && bounds.height <= targetH * 1.001) return groups
  const shrink = Math.min(targetW / bounds.width, targetH / bounds.height, 1)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return groups.map((group) =>
    transformGroup(group, (x, y) => ({
      x: cx + (x - cx) * shrink,
      y: cy + (y - cy) * shrink
    }))
  )
}

function applyScaleSlant(group, cx, cy, typo, accentTypo) {
  const gTypo = resolveGroupTypography(typo, group, accentTypo)
  const slantRad = ((gTypo.slantDeg || 0) * Math.PI) / 180
  const k = Math.tan(slantRad)
  const sx = gTypo.scaleX ?? 1
  const sy = gTypo.scaleY ?? 1
  const lift = gTypo.baselineLiftMm ?? 0

  const scaled = transformGroupAround(group, cx, cy, (lx, ly) => {
    const sxX = lx * sx
    const syY = ly * sy
    return {
      x: cx + sxX + syY * k,
      y: cy + syY + lift
    }
  })
  return scaled
}

function getGroupCenters(groups) {
  return groups.map((group) => {
    const b = computeBoundsFromShapes(group.shapes)
    return {
      cx: (b.minX + b.maxX) / 2,
      cy: (b.minY + b.maxY) / 2,
      width: b.width,
      minX: b.minX,
      maxX: b.maxX
    }
  })
}

function applyArcLayout(groups, typo, accentTypo) {
  const centers = getGroupCenters(groups)
  const spanRad = ((typo.arcSpanDeg ?? 24) * Math.PI) / 180
  const depth = typo.arcDepthMm ?? 2
  const dir = typo.arcDirection ?? 1

  if (groups.length === 1) {
    const c = centers[0]
    return [applyScaleSlant(groups[0], c.cx, c.cy, typo, accentTypo)]
  }

  const startX = centers[0].cx
  const endX = centers[centers.length - 1].cx
  const midX = (startX + endX) / 2
  const midY = centers.reduce((s, c) => s + c.cy, 0) / centers.length
  const cosHalf = Math.cos(spanRad / 2) || 1

  return groups.map((group, i) => {
    const c = centers[i]
    const t = i / (groups.length - 1)
    const angle = -spanRad / 2 + t * spanRad
    const arcYOffset = dir * depth * (1 - Math.cos(angle) / cosHalf)
    const arcXOffset = Math.sin(angle) * (Math.abs(endX - startX) * 0.12)
    const targetCx = midX + (c.cx - midX) + arcXOffset
    const targetCy = midY + arcYOffset
    const dx = targetCx - c.cx
    const dy = targetCy - c.cy

    const translated = transformGroup(group, (x, y) => ({ x: x + dx, y: y + dy }))
    const rotated = transformGroupAround(translated, targetCx, targetCy, (lx, ly) => {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      return {
        x: targetCx + lx * cos - ly * sin,
        y: targetCy + lx * sin + ly * cos
      }
    })
    return applyScaleSlant(rotated, targetCx, targetCy, typo, accentTypo)
  })
}

function applyWaveLayout(groups, typo, accentTypo) {
  const centers = getGroupCenters(groups)
  const amp = typo.waveAmplitudeMm ?? 1.2
  const cycles = typo.waveCycles ?? 1

  return groups.map((group, i) => {
    const c = centers[i]
    const t = groups.length === 1 ? 0.5 : i / (groups.length - 1)
    const yOffset = Math.sin(t * Math.PI * 2 * cycles) * amp
    const tilt = Math.cos(t * Math.PI * 2 * cycles) * 0.12
    const scaled = applyScaleSlant(group, c.cx, c.cy, typo, accentTypo)
    return transformGroupAround(scaled, c.cx, c.cy, (lx, ly, gcx, gcy) => ({
      x: gcx + lx + lx * tilt * 0.15,
      y: gcy + ly + yOffset
    }))
  })
}

/** Terapkan model typography ke grup karakter hasil opentype. */
export function applyTypographyLayout(groups, typo, accentTypo = { enabled: false }) {
  if (!groups.length) return groups
  const layout = typo?.layout || 'straight'

  let result
  if (layout === 'arc') result = applyArcLayout(groups, typo, accentTypo)
  else if (layout === 'wave') result = applyWaveLayout(groups, typo, accentTypo)
  else {
    result = groups.map((group) => {
      const c = getGroupCenters([group])[0]
      return applyScaleSlant(group, c.cx, c.cy, typo, accentTypo)
    })
  }

  if (accentTypo?.enabled) result = reflowGroups(result)
  return result
}
