// Logika generate lightbox — face multi-layer + frame + back (konsep MakerWorld Lightbox Maker).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { resolveLightboxOptions, validateLightboxSize, resolveStandFit } from './lightboxPresets.js'
import { computeOuterSize, resolveDesignLayers } from './lightboxFootprint.js'
import { subtractShapes2D, offsetShapes, cloneShapes } from './shapeClipper.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { packGeometry } from './geometryPack.js'

const EXTRUDE = { bevelEnabled: false, curveSegments: 6 }

function slugify(text) {
  return (
    String(text || 'lightbox')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 32) || 'lightbox'
  )
}

function mergeParts(parts) {
  const usable = parts.filter((g) => g?.attributes?.position?.count)
  if (!usable.length) throw new Error('Geometry kosong')
  const normalized = usable.map((g) => {
    const next = g.index ? g.toNonIndexed() : g.clone()
    if (next !== g) g.dispose()
    return next
  })
  if (normalized.length === 1) return normalized[0]
  const merged = mergeGeometries(normalized, false)
  normalized.forEach((g) => g.dispose())
  if (!merged) throw new Error('Gagal menggabungkan geometry')
  merged.computeVertexNormals()
  return merged
}

function extrudeShapes(shapes, depth) {
  if (!shapes?.length || depth <= 0.01) return null
  const parts = shapes.map((shape) => new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, depth }))
  return mergeParts(parts)
}

function solidBox(w, d, h, x, y, z) {
  const geo = new THREE.BoxGeometry(w, d, h)
  geo.translate(x, y, z)
  return geo
}

function previewBox(w, d, h, x, y, z, color, role, name, extra = {}) {
  return {
    geometry: solidBox(w, d, h, x, y, z),
    color,
    role,
    name,
    previewOnly: true,
    ...extra
  }
}

function roundedRectShape(hw, hd, r) {
  const radius = Math.min(r, hw, hd)
  const shape = new THREE.Shape()
  shape.moveTo(-hw + radius, -hd)
  shape.lineTo(hw - radius, -hd)
  shape.quadraticCurveTo(hw, -hd, hw, -hd + radius)
  shape.lineTo(hw, hd - radius)
  shape.quadraticCurveTo(hw, hd, hw - radius, hd)
  shape.lineTo(-hw + radius, hd)
  shape.quadraticCurveTo(-hw, hd, -hw, hd - radius)
  shape.lineTo(-hw, -hd + radius)
  shape.quadraticCurveTo(-hw, -hd, -hw + radius, -hd)
  shape.closePath()
  return shape
}

function rectShape(w, h) {
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, -h / 2)
  shape.lineTo(w / 2, -h / 2)
  shape.lineTo(w / 2, h / 2)
  shape.lineTo(-w / 2, h / 2)
  shape.closePath()
  return shape
}

function circleHolePath(cx, cy, radius, outerShape, segments = 32) {
  const points = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    points.push(new THREE.Vector2(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius))
  }
  const outerCW = THREE.ShapeUtils.isClockWise(outerShape.getPoints(12))
  const holeCW = THREE.ShapeUtils.isClockWise(points)
  const ordered = outerCW === holeCW ? points.slice().reverse() : points
  const path = new THREE.Path()
  ordered.forEach((p, i) => {
    if (i === 0) path.moveTo(p.x, p.y)
    else path.lineTo(p.x, p.y)
  })
  path.closePath()
  return path
}

function addCircularBackHole(shape, cx, cy, diameterMm) {
  const diameter = Number(diameterMm) || 0
  if (diameter <= 0.1) return
  shape.holes.push(circleHolePath(cx, cy, diameter / 2, shape))
}

function addCableBackHole(shape, opts, hw, hd) {
  const diameter = Number(opts.cableHoleMm) || 0
  if (diameter <= 0.1) return

  const radius = diameter / 2
  const margin = Math.max(opts.wallThicknessMm + radius + 1.2, radius + 1.5)
  const side = opts.cableHoleSide || 'bottom'
  let cx = 0
  let cy = 0

  if (side === 'bottom') cy = -hd + margin
  else if (side === 'left') cx = -hw + margin
  else if (side === 'right') cx = hw - margin

  addCircularBackHole(shape, cx, cy, diameter)
}

function withDiffuserLayer(design, opts) {
  if (!opts.diffuserEnabled) return design
  const shapes =
    design.followOutline && design.outerShapes?.length
      ? cloneShapes(design.outerShapes)
      : [rectShape(design.widthMm, design.heightMm)]
  const diffuser = {
    color: opts.diffuserColor || '#ffffff',
    shapes,
    isBackground: true,
    isDiffuser: true,
    name: 'diffuser'
  }
  return {
    ...design,
    layers: [diffuser, ...design.layers],
    bounds: design.bounds,
    widthMm: design.widthMm,
    heightMm: design.heightMm,
    outerShapes: design.outerShapes,
    followOutline: design.followOutline
  }
}

function facePanelShape(opts) {
  const hw = opts.outerWidthMm / 2
  const hd = opts.outerDepthMm / 2
  return roundedRectShape(hw, hd, opts.cornerRadiusMm)
}

function expandBackgroundToFullFace(design, opts) {
  // SVG: pertahankan siluet luar mengikuti pola desain
  if (design.followOutline && design.outerShapes?.length) {
    const outline = cloneShapes(design.outerShapes)
    const bounds = computeBoundsFromShapes(outline)
    return {
      ...design,
      layers: design.layers.map((layer) => {
        if (!layer.isBackground) return layer
        return {
          ...layer,
          shapes: cloneShapes(outline),
          name: layer.name || (layer.isDiffuser ? 'diffuser_outline' : 'background_outline')
        }
      }),
      outerShapes: outline,
      bounds
    }
  }

  const fullFace = () => [facePanelShape(opts)]
  return {
    ...design,
    layers: design.layers.map((layer) => {
      if (!layer.isBackground) return layer
      return {
        ...layer,
        shapes: fullFace(),
        name: layer.name || (layer.isDiffuser ? 'diffuser_full_face' : 'background_full_face')
      }
    }),
    bounds: {
      minX: -opts.outerWidthMm / 2,
      maxX: opts.outerWidthMm / 2,
      minY: -opts.outerDepthMm / 2,
      maxY: opts.outerDepthMm / 2,
      width: opts.outerWidthMm,
      height: opts.outerDepthMm
    }
  }
}

function buildFaceLayers(design, opts, zStart) {
  const parts = []
  const backDepth = opts.backLayerDepthMm
  const colorDepth = opts.colorLayerDepthMm
  let z = zStart
  const backgroundLayers = design.layers.filter((layer) => layer.isBackground)
  const colorLayers = design.layers.filter((layer) => !layer.isBackground)

  for (let i = 0; i < backgroundLayers.length; i++) {
    const layer = backgroundLayers[i]
    const depth = layer.isDiffuser ? opts.diffuserDepthMm : backDepth
    const geo = extrudeShapes(layer.shapes, depth)
    if (!geo) continue
    geo.translate(0, 0, z)
    const color = layer.color || (layer.isDiffuser ? opts.diffuserColor : opts.colors.background)
    parts.push({
      geometry: geo,
      color,
      role: layer.isDiffuser ? 'diffuser' : 'background',
      name: layer.name || (layer.isDiffuser ? 'diffuser' : `background_${i + 1}`)
    })
    z += depth
  }

  const colorZ = z
  for (let i = 0; i < colorLayers.length; i++) {
    const layer = colorLayers[i]
    const geo = extrudeShapes(layer.shapes, colorDepth)
    if (!geo) continue
    geo.translate(0, 0, colorZ)
    const color = layer.color || opts.colors.text
    parts.push({
      geometry: geo,
      color,
      role: 'color',
      name: layer.name || `color_${i + 1}`
    })
  }

  return { parts, totalDepth: z - zStart + (colorLayers.length ? colorDepth : 0) }
}

function buildFrameBody(opts, outerW, outerD, outerShapes = null) {
  const hw = outerW / 2
  const hd = outerD / 2
  const wall = opts.wallThicknessMm
  const backPanel = opts.backPanelMm
  const cavity = opts.backCavityDepthMm
  const totalH = backPanel + cavity + wall
  const parts = []

  const useOutline = Array.isArray(outerShapes) && outerShapes.length > 0
  const shellOuter = useOutline
    ? cloneShapes(outerShapes)
    : [roundedRectShape(hw, hd, opts.cornerRadiusMm)]

  let shellInner = useOutline
    ? offsetShapes(shellOuter, -wall)
    : [roundedRectShape(hw - wall, hd - wall, Math.max(0, opts.cornerRadiusMm - wall))]
  if (!shellInner?.length) {
    // Fallback jika inset gagal pada siluet rumit
    shellInner = useOutline
      ? offsetShapes(shellOuter, -Math.max(0.6, wall * 0.65))
      : [roundedRectShape(Math.max(2, hw - wall), Math.max(2, hd - wall), Math.max(0, opts.cornerRadiusMm - wall))]
  }

  const ringShapes = subtractShapes2D(shellOuter, shellInner)
  const wallGeo = extrudeShapes(ringShapes, totalH - backPanel)
  if (wallGeo) {
    wallGeo.translate(0, 0, backPanel)
    parts.push({ geometry: wallGeo, color: opts.colors.frame, role: 'frame', name: 'frame_shell' })
  }

  const backShapes = cloneShapes(shellOuter)
  for (const backShape of backShapes) {
    addCableBackHole(backShape, opts, hw, hd)
    if (opts.hangingHoleMm > 0) {
      const maxY = hd - wall - opts.hangingHoleMm / 2
      const cy = Math.min(hd - opts.hangingHoleOffsetMm, maxY)
      addCircularBackHole(backShape, 0, cy, opts.hangingHoleMm)
    }
  }

  const backGeo = extrudeShapes(backShapes, backPanel)
  if (backGeo) {
    parts.push({ geometry: backGeo, color: opts.colors.back, role: 'back', name: 'back_panel' })
  }

  return { parts, totalH }
}

function buildLedStripPreview(opts, outerW, outerD) {
  if (!opts.ledStripEnabled) return []
  const hw = outerW / 2
  const hd = outerD / 2
  const wall = opts.wallThicknessMm
  const stripW = Math.min(opts.ledStripWidthMm, Math.max(1.8, wall + 3))
  const inset = wall + stripW / 2 + 1.2
  const innerW = Math.max(6, outerW - inset * 2)
  const innerD = Math.max(6, outerD - inset * 2)
  const z = opts.backPanelMm + 0.22
  const parts = []
  const stripColor = opts.ledStripColor || '#f6c343'
  const lightColor = opts.ledLightColor || '#fff1a8'
  const copper = '#b76e2c'

  parts.push(previewBox(innerW, stripW, 0.28, 0, hd - inset, z, stripColor, 'ledStrip', 'led_strip_top'))
  parts.push(previewBox(innerW, stripW, 0.28, 0, -hd + inset, z, stripColor, 'ledStrip', 'led_strip_bottom'))
  parts.push(previewBox(stripW, innerD, 0.28, -hw + inset, 0, z, stripColor, 'ledStrip', 'led_strip_left'))
  parts.push(previewBox(stripW, innerD, 0.28, hw - inset, 0, z, stripColor, 'ledStrip', 'led_strip_right'))

  const chipGap = 18
  const padGap = 9
  const chipZ = z + 0.22
  const glowZ = opts.backPanelMm + opts.backCavityDepthMm * 0.55
  const chipExtra = { glow: true, glowIntensity: 0.85 }
  const addAlongX = (y, prefix) => {
    const count = Math.max(1, Math.floor(innerW / chipGap))
    for (let i = 0; i < count; i++) {
      const x = -innerW / 2 + ((i + 0.5) * innerW) / count
      parts.push(previewBox(3.2, 2.4, 0.22, x, y, chipZ, lightColor, 'ledChip', `${prefix}_led_${i + 1}`, chipExtra))
      parts.push(previewBox(2.2, 0.55, 0.1, x - padGap / 2, y, chipZ + 0.12, copper, 'ledPad', `${prefix}_pad_a_${i + 1}`))
      parts.push(previewBox(2.2, 0.55, 0.1, x + padGap / 2, y, chipZ + 0.12, copper, 'ledPad', `${prefix}_pad_b_${i + 1}`))
    }
  }
  const addAlongY = (x, prefix) => {
    const count = Math.max(1, Math.floor(innerD / chipGap))
    for (let i = 0; i < count; i++) {
      const y = -innerD / 2 + ((i + 0.5) * innerD) / count
      parts.push(previewBox(2.4, 3.2, 0.22, x, y, chipZ, lightColor, 'ledChip', `${prefix}_led_${i + 1}`, chipExtra))
      parts.push(previewBox(0.55, 2.2, 0.1, x, y - padGap / 2, chipZ + 0.12, copper, 'ledPad', `${prefix}_pad_a_${i + 1}`))
      parts.push(previewBox(0.55, 2.2, 0.1, x, y + padGap / 2, chipZ + 0.12, copper, 'ledPad', `${prefix}_pad_b_${i + 1}`))
    }
  }

  addAlongX(hd - inset, 'top')
  addAlongX(-hd + inset, 'bottom')
  addAlongY(-hw + inset, 'left')
  addAlongY(hw - inset, 'right')
  parts.push(
    previewBox(
      Math.max(8, outerW - wall * 4),
      Math.max(8, outerD - wall * 4),
      0.08,
      0,
      0,
      glowZ,
      lightColor,
      'ledGlow',
      'warm_led_glow',
      { opacity: 0.16, glow: true, glowIntensity: 1.2 }
    )
  )

  return parts
}

function buildLedFaceGlowPreview(opts, designW, designH, z) {
  if (!opts.ledStripEnabled) return []
  return [
    previewBox(
      Math.max(8, opts.outerWidthMm),
      Math.max(8, opts.outerDepthMm),
      0.06,
      0,
      0,
      z,
      opts.ledLightColor || '#fff1a8',
      'ledGlow',
      'front_light_glow',
      { opacity: opts.diffuserEnabled ? 0.13 : 0.09, glow: true, glowIntensity: 1.1 }
    )
  ]
}

function standPart(geometry, color, name, extra = {}) {
  return { geometry, color, role: 'stand', name, ...extra }
}

function buildStandCradle(fit, opts) {
  const { standW, slotMm } = fit
  const standD = opts.standDepthMm
  const baseH = opts.standBaseHeightMm
  const railH = opts.standRailHeightMm
  const railD = Math.max((standD - slotMm) / 2, 3)
  const capW = Math.min(8, standW * 0.14)
  const color = opts.standColor || opts.colors.frame
  const shadowW = Math.max(4, standW - capW * 2 - 3)
  return {
    parts: [
      standPart(solidBox(standW, standD, baseH, 0, 0, baseH / 2), color, 'stand_base'),
      standPart(solidBox(standW, railD, railH, 0, -slotMm / 2 - railD / 2, baseH + railH / 2), color, 'stand_front_lip'),
      standPart(solidBox(standW, railD, railH, 0, slotMm / 2 + railD / 2, baseH + railH / 2), color, 'stand_back_lip'),
      standPart(solidBox(capW, standD, railH, -standW / 2 + capW / 2, 0, baseH + railH / 2), color, 'stand_left_stop'),
      standPart(solidBox(capW, standD, railH, standW / 2 - capW / 2, 0, baseH + railH / 2), color, 'stand_right_stop'),
      previewBox(shadowW, slotMm, 0.08, 0, 0, baseH + 0.07, '#0b0d10', 'standSlot', 'stand_slot_shadow', { opacity: 0.24 })
    ],
    heightMm: baseH + railH
  }
}

function buildStandWide(fit, opts) {
  const { standW, slotMm, outerW } = fit
  const standD = opts.standDepthMm
  const baseH = opts.standBaseHeightMm
  const railH = opts.standRailHeightMm
  const railD = Math.max((standD - slotMm) / 2, 3.5)
  const color = opts.standColor || opts.colors.frame
  const inset = Math.max(2, (standW - outerW) / 2)
  const innerW = Math.max(4, standW - inset * 2)
  return {
    parts: [
      standPart(solidBox(standW, standD, baseH, 0, 0, baseH / 2), color, 'stand_base'),
      standPart(solidBox(innerW, railD, railH, 0, -slotMm / 2 - railD / 2, baseH + railH / 2), color, 'stand_front_lip'),
      standPart(solidBox(innerW, railD, railH, 0, slotMm / 2 + railD / 2, baseH + railH / 2), color, 'stand_back_lip'),
      standPart(solidBox(inset, standD, railH, -standW / 2 + inset / 2, 0, baseH + railH / 2), color, 'stand_left_stop'),
      standPart(solidBox(inset, standD, railH, standW / 2 - inset / 2, 0, baseH + railH / 2), color, 'stand_right_stop'),
      previewBox(innerW, slotMm, 0.08, 0, 0, baseH + 0.07, '#0b0d10', 'standSlot', 'stand_slot_shadow', { opacity: 0.24 })
    ],
    heightMm: baseH + railH
  }
}

function buildStandLean(fit, opts) {
  const { standW, slotMm, lightboxThickness } = fit
  const standD = opts.standDepthMm
  const baseH = opts.standBaseHeightMm
  const backH = opts.standRailHeightMm
  const color = opts.standColor || opts.colors.frame
  const lipH = Math.min(4, backH * 0.35)
  const lipD = Math.max(3, standD * 0.12)
  const backD = Math.max(4, standD * 0.18)
  const leanGap = Math.max(2, lightboxThickness * 0.08)
  return {
    parts: [
      standPart(solidBox(standW, standD, baseH, 0, 0, baseH / 2), color, 'stand_base'),
      standPart(solidBox(standW, lipD, lipH, 0, -standD / 2 + lipD / 2, baseH + lipH / 2), color, 'stand_front_lip'),
      standPart(solidBox(standW, backD, backH, 0, standD / 2 - backD / 2, baseH + backH / 2), color, 'stand_back_wall'),
      standPart(
        solidBox(standW * 0.92, backD * 0.7, Math.max(3, backH * 0.45), 0, standD / 2 - backD * 1.1, baseH + backH * 0.55),
        color,
        'stand_lean_support'
      ),
      previewBox(standW * 0.7, slotMm + leanGap, 0.08, 0, -standD * 0.08, baseH + 0.07, '#0b0d10', 'standSlot', 'stand_slot_shadow', { opacity: 0.2 })
    ],
    heightMm: baseH + backH
  }
}

function buildStandPedestal(fit, opts) {
  const { standW, slotMm, outerW } = fit
  const standD = opts.standDepthMm
  const baseH = opts.standBaseHeightMm
  const railH = opts.standRailHeightMm
  const color = opts.standColor || opts.colors.frame
  const basePadW = Math.max(standW, outerW * 0.7)
  const basePadD = standD
  const postW = Math.min(Math.max(outerW * 0.22, 14), standW * 0.45)
  const postD = Math.max(8, standD * 0.35)
  const cradleW = Math.min(outerW + 3, standW)
  const railD = Math.max((standD * 0.55 - slotMm) / 2, 2.5)
  const cradleY = -standD * 0.12
  return {
    parts: [
      standPart(solidBox(basePadW, basePadD, baseH, 0, 0, baseH / 2), color, 'stand_base'),
      standPart(solidBox(postW, postD, railH * 0.65, 0, cradleY, baseH + railH * 0.32), color, 'stand_post'),
      standPart(solidBox(cradleW, railD, railH, 0, cradleY - slotMm / 2 - railD / 2, baseH + railH * 0.65 + railH / 2), color, 'stand_front_lip'),
      standPart(solidBox(cradleW, railD, railH, 0, cradleY + slotMm / 2 + railD / 2, baseH + railH * 0.65 + railH / 2), color, 'stand_back_lip'),
      previewBox(cradleW * 0.85, slotMm, 0.08, 0, cradleY, baseH + railH * 0.66, '#0b0d10', 'standSlot', 'stand_slot_shadow', { opacity: 0.22 })
    ],
    heightMm: baseH + railH * 1.65
  }
}

function buildStandClip(fit, opts) {
  const { standW, slotMm } = fit
  const standD = opts.standDepthMm
  const baseH = opts.standBaseHeightMm
  const lipH = opts.standRailHeightMm
  const color = opts.standColor || opts.colors.frame
  const lipD = Math.max(2.5, standD * 0.22)
  const bumpD = Math.max(2, standD * 0.15)
  return {
    parts: [
      standPart(solidBox(standW, standD, baseH, 0, 0, baseH / 2), color, 'stand_base'),
      standPart(solidBox(standW, lipD, lipH, 0, -standD / 2 + lipD / 2, baseH + lipH / 2), color, 'stand_front_lip'),
      standPart(solidBox(standW * 0.6, bumpD, lipH * 0.7, 0, standD / 2 - bumpD / 2, baseH + lipH * 0.35), color, 'stand_back_bump'),
      previewBox(standW * 0.75, slotMm, 0.06, 0, 0, baseH + 0.05, '#0b0d10', 'standSlot', 'stand_slot_shadow', { opacity: 0.2 })
    ],
    heightMm: baseH + lipH
  }
}

function buildStandWall(fit, opts) {
  const { standW, slotMm, lightboxThickness } = fit
  const bracketD = opts.standDepthMm
  const plateH = Math.max(lightboxThickness + 6, slotMm + 4)
  const lipT = Math.max(2.5, opts.standBaseHeightMm)
  const color = opts.standColor || opts.colors.frame
  const armW = Math.max(6, standW * 0.08)
  const holeR = 2.2
  const holeSpacing = Math.min(standW * 0.55, 40)
  return {
    parts: [
      standPart(solidBox(standW, bracketD, plateH, 0, 0, plateH / 2), color, 'stand_back_plate'),
      standPart(solidBox(standW, lipT, lipT * 1.4, 0, -bracketD / 2 + lipT / 2, plateH * 0.35), color, 'stand_bottom_lip'),
      standPart(solidBox(standW, lipT, lipT * 1.4, 0, -bracketD / 2 + lipT / 2, plateH * 0.75), color, 'stand_top_lip'),
      standPart(solidBox(armW, bracketD, lipT, -standW / 2 + armW / 2, 0, plateH * 0.35), color, 'stand_left_arm'),
      standPart(solidBox(armW, bracketD, lipT, standW / 2 - armW / 2, 0, plateH * 0.35), color, 'stand_right_arm'),
      previewBox(standW - armW * 2 - 2, slotMm, 0.06, 0, 0, plateH * 0.55, '#0b0d10', 'standSlot', 'stand_slot_shadow', { opacity: 0.22 }),
      previewBox(holeR * 2, holeR * 2, 0.04, -holeSpacing / 2, bracketD / 2 - 3, plateH * 0.82, '#334155', 'standHole', 'screw_hole_a', { opacity: 0.35 }),
      previewBox(holeR * 2, holeR * 2, 0.04, holeSpacing / 2, bracketD / 2 - 3, plateH * 0.82, '#334155', 'standHole', 'screw_hole_b', { opacity: 0.35 })
    ],
    heightMm: plateH,
    assemblyMode: 'wall'
  }
}

function buildStandModel(opts, outerW, outerD, lightboxThickness) {
  if (!opts.standEnabled || opts.standModelId === 'none') return { parts: [], dimensions: null }

  const fit = resolveStandFit(opts, outerW, outerD, lightboxThickness)
  const standD = opts.standDepthMm
  const builders = {
    cradle: buildStandCradle,
    wide: buildStandWide,
    lean: buildStandLean,
    pedestal: buildStandPedestal,
    clip: buildStandClip,
    wall: buildStandWall
  }
  const builder = builders[opts.standModelId] || buildStandCradle
  const built = builder(fit, opts)

  return {
    parts: built.parts,
    dimensions: {
      widthMm: fit.standW,
      depthMm: standD,
      heightMm: built.heightMm,
      slotMm: fit.slotMm,
      modelId: opts.standModelId,
      assemblyMode: built.assemblyMode || 'desk'
    }
  }
}

function cloneStandAssemblyParts(stand, opts, lightboxThickness) {
  if (!stand.parts?.length || !stand.dimensions) return []
  const baseLift = Math.max(1.5, opts.standBaseHeightMm || 3)
  const y = -opts.outerDepthMm / 2 - baseLift
  const z = lightboxThickness / 2
  return stand.parts.filter((part) => !part.previewOnly).map((part) => {
    const geometry = part.geometry.clone()
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, y, z)
    return { ...part, geometry }
  })
}

function cloneStandExportParts(stand) {
  return stand.parts
    .filter((part) => !part.previewOnly)
    .map((part) => {
      const geometry = part.geometry.clone()
      geometry.computeVertexNormals()
      return { ...part, geometry }
    })
}

function cloneFrontSidePrintPart(part, totalHeight) {
  const geometry = part.geometry.clone()
  geometry.scale(-1, 1, -1)
  geometry.translate(0, 0, totalHeight)
  geometry.computeVertexNormals()
  return { ...part, geometry, printMirrored: true }
}

function serializePreviewPart(p) {
  return {
    geometry: packGeometry(p.geometry),
    color: p.color,
    role: p.role || null,
    name: p.name || p.role || null,
    previewOnly: !!p.previewOnly,
    opacity: p.opacity ?? null,
    glow: !!p.glow,
    glowIntensity: p.glowIntensity ?? null,
    printMirrored: !!p.printMirrored
  }
}

function meshToStlArrayBuffer(mesh) {
  mesh.updateMatrixWorld(true)
  const exporter = new STLExporter()
  const data = exporter.parse(mesh, { binary: true })
  if (data instanceof ArrayBuffer) return data.slice(0)
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  }
  return new TextEncoder().encode(String(data)).buffer
}

export async function generateLightboxCore(userOpts = {}) {
  const opts = resolveLightboxOptions(userOpts)
  let design = withDiffuserLayer(await resolveDesignLayers(opts), opts)

  if (design.followOutline && design.outerShapes?.length) {
    // Siluet SVG sudah termasuk border; dinding di-inset ke dalam —
    // jangan inflate AABB / jangan validasi min seolah desain masih "isi saja".
    opts.outerWidthMm = design.widthMm
    opts.outerDepthMm = design.heightMm
  } else {
    const outer = computeOuterSize(design.widthMm, design.heightMm, opts)
    opts.outerWidthMm = outer.outerWidthMm
    opts.outerDepthMm = outer.outerDepthMm
    validateLightboxSize(opts, { width: design.widthMm, height: design.heightMm })
  }
  design = expandBackgroundToFullFace(design, opts)
  let imageOverrideIndex = 0
  let svgOverrideIndex = 0
  const layerPalette = design.layers.map((layer, index) => {
    let overrideIndex = null
    if (opts.designMode === 'image' && !layer.isDiffuser) {
      overrideIndex = imageOverrideIndex++
    } else if (
      (opts.designMode === 'svg' || opts.designMode === 'svg-qr') &&
      !layer.isDiffuser &&
      !layer.isBackground &&
      layer.name !== 'qr_caption'
    ) {
      overrideIndex = svgOverrideIndex++
    }
    return {
      index,
      overrideIndex,
      name:
        layer.name === 'qr_caption'
          ? 'Teks bawah'
          : layer.name || (layer.isDiffuser ? 'Diffuser' : layer.isBackground ? 'Background' : `Color ${index + 1}`),
      color: layer.color || (layer.isBackground ? opts.colors.background : opts.colors.text),
      isBackground: !!layer.isBackground,
      isDiffuser: !!layer.isDiffuser
    }
  })

  const frame = buildFrameBody(opts, opts.outerWidthMm, opts.outerDepthMm, design.outerShapes)
  const ledPreviewParts = buildLedStripPreview(opts, opts.outerWidthMm, opts.outerDepthMm)
  const faceZ = frame.totalH
  const face = buildFaceLayers(design, opts, faceZ)
  const faceGlowParts = buildLedFaceGlowPreview(opts, design.widthMm, design.heightMm, faceZ + face.totalDepth + 0.05)
  const totalHeight = frame.totalH + face.totalDepth
  const stand = buildStandModel(opts, opts.outerWidthMm, opts.outerDepthMm, totalHeight)
  const standExportParts = cloneStandExportParts(stand)
  const standAssemblyParts = cloneStandAssemblyParts(stand, opts, totalHeight)

  const frameExportParts = frame.parts.filter((p) => p.role === 'frame')
  const backExportParts = frame.parts.filter((p) => p.role === 'back')
  const frontSidePrintParts = [...frameExportParts, ...face.parts].map((part) =>
    cloneFrontSidePrintPart(part, totalHeight)
  )
  const facePreviewParts = frontSidePrintParts
  const bodyPreviewParts = backExportParts
  const frontSidePreviewParts = facePreviewParts
  const backPreviewParts = bodyPreviewParts
  const standPreviewParts = stand.parts
  const assemblyPreviewParts = [...frame.parts, ...ledPreviewParts, ...face.parts, ...faceGlowParts, ...standAssemblyParts]

  const faceGeos = frontSidePrintParts.map((p) => p.geometry)
  const bodyGeos = backExportParts.map((p) => p.geometry)
  const faceMerged = mergeParts(faceGeos.map((g) => g.clone()))
  const bodyMerged = mergeParts(bodyGeos.map((g) => g.clone()))
  const standMerged = standExportParts.length ? mergeParts(standExportParts.map((p) => p.geometry.clone())) : null

  const faceMesh = new THREE.Mesh(faceMerged, new THREE.MeshStandardMaterial())
  const bodyMesh = new THREE.Mesh(bodyMerged, new THREE.MeshStandardMaterial())
  const standMesh = standMerged ? new THREE.Mesh(standMerged, new THREE.MeshStandardMaterial()) : null
  const slug = slugify(opts.label || opts.text)

  const result = {
    slug,
    designMode: opts.designMode,
    frontSideFilename: `${slug}_front_side.stl`,
    backFilename: `${slug}_back.stl`,
    baseFilename: `${slug}_front_side.stl`,
    bodyFilename: `${slug}_back.stl`,
    standFilename: `${slug}_stand_${opts.standModelId}.stl`,
    accentFilename: `${slug}_front_side.stl`,
    lidFilename: `${slug}_back.stl`,
    basePreviewColor: opts.colors.background,
    dimensions: {
      widthMm: Number(opts.outerWidthMm.toFixed(1)),
      depthMm: Number(opts.outerDepthMm.toFixed(1)),
      heightMm: Number(totalHeight.toFixed(1)),
      faceDepthMm: Number(face.totalDepth.toFixed(1)),
      cavityDepthMm: Number(opts.backCavityDepthMm.toFixed(1)),
      designWidthMm: Number(design.widthMm.toFixed(1)),
      designHeightMm: Number(design.heightMm.toFixed(1)),
      standWidthMm: Number((stand.dimensions?.widthMm || 0).toFixed(1)),
      standDepthMm: Number((stand.dimensions?.depthMm || 0).toFixed(1)),
      standHeightMm: Number((stand.dimensions?.heightMm || 0).toFixed(1)),
      standSlotMm: Number((stand.dimensions?.slotMm || 0).toFixed(1)),
      standModelId: stand.dimensions?.modelId || opts.standModelId || 'none',
      layerCount: design.layers.length
    },
    layerPalette,
    frontSidePreviewParts: frontSidePreviewParts.map(serializePreviewPart),
    backPreviewParts: backPreviewParts.map(serializePreviewPart),
    facePreviewParts: facePreviewParts.map(serializePreviewPart),
    bodyPreviewParts: bodyPreviewParts.map(serializePreviewPart),
    standPreviewParts: standPreviewParts.map(serializePreviewPart),
    standExportPreviewParts: standExportParts.map(serializePreviewPart),
    basePreviewParts: facePreviewParts.map(serializePreviewPart),
    lidPreviewParts: bodyPreviewParts.map(serializePreviewPart),
    accentPreviewParts: facePreviewParts.map(serializePreviewPart),
    assemblyPreviewParts: assemblyPreviewParts.map(serializePreviewPart),
    baseMergedExportGeometry: null,
    frontSideStlBuffer: meshToStlArrayBuffer(faceMesh),
    backStlBuffer: meshToStlArrayBuffer(bodyMesh),
    baseStlBuffer: meshToStlArrayBuffer(faceMesh),
    lidStlBuffer: meshToStlArrayBuffer(bodyMesh),
    accentStlBuffer: meshToStlArrayBuffer(faceMesh),
    bodyStlBuffer: meshToStlArrayBuffer(bodyMesh),
    standStlBuffer: standMesh ? meshToStlArrayBuffer(standMesh) : null
  }

  faceMesh.geometry.dispose()
  bodyMesh.geometry.dispose()
  standMesh?.geometry.dispose()
  frontSidePrintParts.forEach((p) => p.geometry?.dispose())
  frame.parts.forEach((p) => p.geometry?.dispose())
  face.parts.forEach((p) => p.geometry?.dispose())
  ledPreviewParts.forEach((p) => p.geometry?.dispose())
  faceGlowParts.forEach((p) => p.geometry?.dispose())
  stand.parts.forEach((p) => p.geometry?.dispose())
  standExportParts.forEach((p) => p.geometry?.dispose())
  standAssemblyParts.forEach((p) => p.geometry?.dispose())

  return result
}
