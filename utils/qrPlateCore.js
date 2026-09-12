import { parse, Path } from 'opentype.js'
import { createQrPlateDesign } from './qrPlateDesign.js'
import { opentypePathToShapes } from './opentypeToShapes.js'
import { shapesToRings } from './clickerManifold/meshUtils.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { qrIconContours } from './qrPlateIcons.js'
import { buildQrPlateStand } from './qrPlateStand.js'
import { deserializeShapes } from './svgToShapes.js'

function packSolid(solid, track) {
  if (solid.status() !== 'NoError' || solid.volume() <= 0) throw new Error('Geometri pelat tidak valid')
  const mesh = track(solid.calculateNormals(0, 35)).getMesh()
  const stride = mesh.numProp
  const count = mesh.vertProperties.length / stride
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) {
      positions[i * 3 + j] = mesh.vertProperties[i * stride + j]
      normals[i * 3 + j] = mesh.vertProperties[i * stride + j + 3]
    }
  }
  if (mesh.triVerts.length > 600000) throw new Error('Model terlalu kompleks — pendekkan konten QR')
  // Preserve the kernel's vertex pairing: diagonal QR cells can meet at an edge.
  // Re-welding solely by coordinates can change the topology at those junctions.
  return { positions, normals, indices: new Uint32Array(mesh.triVerts),
    mergeFromVert: new Uint32Array(mesh.mergeFromVert), mergeToVert: new Uint32Array(mesh.mergeToVert) }
}

export function textCaptionRings(text, fontBuffer) {
  const caption = String(text ?? '').trim()
  if (!caption) return { rings: [], aspect: 0 }
  if (!(fontBuffer instanceof ArrayBuffer)) throw new Error('Font untuk tulisan belum tersedia')
  const font = parse(fontBuffer)
  for (const char of caption) {
    if (char.trim() && !font.charToGlyph(char).index) throw new Error(`Font tidak mendukung karakter “${char}” — pilih font lain`)
  }
  const path = new Path()
  let cursor = 0, previous = null
  for (const char of caption) {
    const glyph = font.charToGlyph(char)
    if (previous) cursor += font.getKerningValue(previous, glyph) * 100 / font.unitsPerEm
    path.extend(glyph.getPath(cursor, 0, 100))
    cursor += glyph.advanceWidth * 100 / font.unitsPerEm
    previous = glyph
  }
  const shapes = opentypePathToShapes(path)
  const bounds = computeBoundsFromShapes(shapes)
  if (!(bounds.width > 0 && bounds.height > 0)) throw new Error('Tulisan tidak menghasilkan bentuk')
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2
  return {
    rings: shapesToRings(shapes, 24).map((ring) => ring.map(([x, y]) => [(x - cx) / bounds.height, (y - cy) / bounds.height])),
    aspect: bounds.width / bounds.height
  }
}

export function qrCaptionRings(design, fontBuffer) {
  return textCaptionRings(design.opts.caption, fontBuffer)
}

function positiveRings(rings) {
  return rings.map((ring) => {
    const area = ring.reduce((sum, [x, y], i) => { const [nx, ny] = ring[(i + 1) % ring.length]; return sum + x * ny - nx * y }, 0)
    return area < 0 ? [...ring].reverse() : ring
  })
}

function qrModuleRings(code, qrSizeMm) {
  const { runs, moduleMm, centerX, centerY } = code
  return runs.map(([col, row, length]) => {
    const x = centerX - qrSizeMm / 2 + (col + 4) * moduleMm
    const y = centerY + qrSizeMm / 2 - (row + 5) * moduleMm
    // A 0.01 mm corner relief separates diagonal-only contacts. Without it,
    // two raised QR cells share a vertical edge and legacy slicers report
    // a non-manifold surface, even when they are attached to the same base.
    const w = length * moduleMm, h = moduleMm, c = 0.01
    return [[x+c,y], [x+w-c,y], [x+w,y+c], [x+w,y+h-c],
      [x+w-c,y+h], [x+c,y+h], [x,y+h-c], [x,y+c]]
  })
}

function placeIcon(iconId, sizeMm, originX, originY) {
  const icon = qrIconContours(iconId)
  if (!icon.solid.length) return { meta: null, map: null }
  const solids = icon.solid.flat()
  const minX = Math.min(...solids.map((p) => p[0])), maxX = Math.max(...solids.map((p) => p[0]))
  const minY = Math.min(...solids.map((p) => p[1])), maxY = Math.max(...solids.map((p) => p[1]))
  const scale = Math.min(sizeMm, sizeMm) / Math.max(maxX - minX, maxY - minY)
  const map = (rings) => positiveRings(rings).map((ring) => ring.map(([x, y]) => [
    (x - (minX + maxX) / 2) * scale + originX,
    (y - (minY + maxY) / 2) * scale + originY
  ]))
  return {
    meta: { solid: positiveRings(icon.solid), holes: positiveRings(icon.holes), extra: positiveRings(icon.extra || []), bounds: { minX, maxX, minY, maxY } },
    map, icon
  }
}

function thickenSection(section, track, strokeMm) {
  const grow = Number(strokeMm) / 2
  if (!(grow > 0.01)) return section
  return track(section.offset(grow, 'Round', 2, 32))
}

function placeHeaderLogo(shapesData, sizeMm, originX, originY, maxWidthMm) {
  if (!shapesData?.length) return { rings: [], aspect: 0 }
  const shapes = deserializeShapes(shapesData)
  if (!shapes.length) throw new Error('Logo SVG tidak punya bidang atau garis yang terlihat')
  const bounds = computeBoundsFromShapes(shapes)
  const maxDim = Math.max(bounds.width, bounds.height)
  if (!(maxDim > 0)) throw new Error('Ukuran logo SVG tidak valid')
  let scale = sizeMm / maxDim
  const width = bounds.width * scale
  if (width > maxWidthMm) scale *= maxWidthMm / width
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const rings = shapesToRings(shapes, 24).map((ring) => ring.map(([x, y]) => [
    (x - cx) * scale + originX,
    (y - cy) * scale + originY
  ]))
  return { rings: positiveRings(rings), aspect: bounds.width / bounds.height }
}

export function buildQrPlate(wasm, input, fontBuffer = null) {
  const design = createQrPlateDesign(input)
  const { opts, widthMm, depthMm, holes, cornerRadiusMm: radius, codes } = design
  const { Manifold, CrossSection } = wasm
  const owned = new Set()
  const track = (value) => { owned.add(value); return value }
  try {
    let plate = track(CrossSection.square([widthMm - 2 * radius, depthMm - 2 * radius], true))
    if (radius) plate = track(plate.offset(radius, 'Round', 2, 64))
    for (const point of holes) {
      const disk = track(track(CrossSection.circle(opts.holeDiameterMm / 2, 64)).translate(point))
      plate = track(plate.subtract(disk))
    }
    const qrRings = codes.flatMap((code) => qrModuleRings(code, opts.qrSizeMm))
    const detail = track(new CrossSection(qrRings, 'NonZero'))
    let decoration = null
    const addDecoration = (section) => {
      decoration = decoration ? track(decoration.add(section)) : section
    }
    for (const code of codes) {
      const caption = textCaptionRings(code.caption, fontBuffer)
      code.captionRings = caption
      const captionScale = caption.rings.length ? Math.min(opts.captionHeightMm, opts.qrSizeMm / caption.aspect) : 0
      if (captionScale && captionScale < 2) throw new Error('Tulisan terlalu kecil — pendekkan tulisan atau perbesar QR')
      if (caption.rings.length) {
        const section = thickenSection(track(new CrossSection(caption.rings.map((ring) => ring.map(([x, y]) => [
          x * captionScale + code.centerX,
          y * captionScale + code.captionCenterY
        ])), 'NonZero')), track, opts.captionStrokeMm)
        addDecoration(section)
      }
      const placed = placeIcon(code.iconId, Math.min(opts.iconSizeMm, opts.qrSizeMm), code.centerX, code.iconCenterY)
      if (placed.meta) {
        let section = track(new CrossSection(placed.map(placed.icon.solid), 'NonZero'))
        if (placed.icon.holes.length) section = track(section.subtract(track(new CrossSection(placed.map(placed.icon.holes), 'NonZero'))))
        if (placed.icon.extra?.length) section = track(section.add(track(new CrossSection(placed.map(placed.icon.extra), 'NonZero'))))
        addDecoration(section)
        code.icon = placed.meta
      }
    }
    const headerMaxWidth = Math.max(12, widthMm - opts.marginMm * 2)
    const businessName = textCaptionRings(opts.businessName, fontBuffer)
    const businessScale = businessName.rings.length
      ? Math.min(opts.businessNameHeightMm, headerMaxWidth / businessName.aspect)
      : 0
    if (businessScale && businessScale < 2) throw new Error('Nama usaha terlalu kecil — pendekkan teks atau perbesar pelat')
    const placedBusinessRings = businessName.rings.map((ring) => ring.map(([x, y]) => [
      x * businessScale,
      y * businessScale + design.businessNameCenterY
    ]))
    design.businessNameRings = { rings: placedBusinessRings, aspect: businessName.aspect, scale: businessScale }
    if (placedBusinessRings.length) {
      addDecoration(track(new CrossSection(placedBusinessRings, 'NonZero')))
    }
    const headerLogo = placeHeaderLogo(
      opts.headerLogoShapes,
      Math.min(opts.headerLogoSizeMm, headerMaxWidth),
      0,
      design.headerLogoCenterY,
      headerMaxWidth
    )
    design.headerLogoRings = headerLogo
    if (headerLogo.rings.length) {
      addDecoration(thickenSection(track(new CrossSection(headerLogo.rings, 'NonZero')), track, opts.headerLogoStrokeMm))
    }
    const firstCaption = codes.length === 1 ? (codes[0]?.captionRings || { rings: [], aspect: 0 }) : { rings: [], aspect: 0 }
    if (codes.length === 1 && codes[0]?.icon) design.icon = codes[0].icon
    const detailZ = opts.surfaceMode === 'inlay' ? opts.baseThicknessMm - opts.detailHeightMm : opts.baseThicknessMm
    const detailSolid = track(track(Manifold.extrude(detail, opts.detailHeightMm)).translate([0, 0, detailZ]))
    const decorationSolid = decoration ? track(track(Manifold.extrude(decoration, opts.detailHeightMm)).translate([0, 0, detailZ])) : null
    // A white QR panel is embedded in the coloured frame; the border and lower
    // icon band remain dark, as on the reference desk plaques.
    const panelDepth = Math.min(opts.baseThicknessMm - 0.8, Math.max(1, opts.detailHeightMm + 0.2))
    let panel = null
    for (const code of codes) {
      const square = track(track(CrossSection.square([opts.qrSizeMm, opts.qrSizeMm], true)).translate([code.centerX, code.centerY]))
      panel = panel ? track(panel.add(square)) : square
    }
    let panelSolid = track(track(Manifold.extrude(panel, panelDepth)).translate([0, 0, opts.baseThicknessMm - panelDepth]))
    let baseSolid = track(track(Manifold.extrude(plate, opts.baseThicknessMm)).subtract(panelSolid))
    if (opts.surfaceMode === 'inlay') {
      panelSolid = track(panelSolid.subtract(detailSolid))
      if (decorationSolid) baseSolid = track(baseSolid.subtract(decorationSolid))
    }
    const plateSolids = [baseSolid, panelSolid, detailSolid, decorationSolid].filter(Boolean)
    const merged = track(Manifold.union(plateSolids))
    const components = merged.decompose()
    components.forEach(track)
    if (components.length !== 1) throw new Error('Pelat belum tersambung menjadi satu solid')
    const stand = buildQrPlateStand(wasm, design, track)
    if (stand) {
      const pieces = stand.decompose()
      pieces.forEach(track)
      if (pieces.length !== 1) throw new Error('Dudukan belum tersambung menjadi satu solid')
    }
    const bbox = merged.boundingBox()
    return {
      design: { ...design, caption: firstCaption },
      parts: [
        { name: 'Bingkai pelat', role: 'frame', group: 'plate', color: opts.colors.frame, geometry: packSolid(baseSolid, track) },
        { name: 'Panel QR terang', role: 'base', group: 'plate', color: opts.colors.base, geometry: packSolid(panelSolid, track) },
        { name: 'Pola QR', role: 'detail', group: 'plate', color: opts.colors.detail, geometry: packSolid(detailSolid, track) },
        ...(decorationSolid ? [{ name: 'Ikon dan tulisan', role: 'icon', group: 'plate', color: opts.colors.icon, geometry: packSolid(decorationSolid, track) }] : []),
        ...(stand ? [{ name: 'Alas dudukan', role: 'stand', group: 'stand', color: opts.colors.frame, geometry: packSolid(stand, track) }] : [])
      ],
      geometry: packSolid(merged, track),
      dimensions: { widthMm: bbox.max[0] - bbox.min[0], depthMm: bbox.max[1] - bbox.min[1], heightMm: bbox.max[2] - bbox.min[2] },
      volumeMm3: merged.volume() + (stand?.volume() || 0), triangles: merged.numTri() + (stand?.numTri() || 0), warnings: design.warnings
    }
  } finally {
    for (const value of [...owned].reverse()) value.delete()
  }
}
