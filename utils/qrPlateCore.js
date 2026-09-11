import { parse, Path } from 'opentype.js'
import { createQrPlateDesign } from './qrPlateDesign.js'
import { opentypePathToShapes } from './opentypeToShapes.js'
import { shapesToRings } from './clickerManifold/meshUtils.js'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { qrIconContours } from './qrPlateIcons.js'
import { buildQrPlateStand } from './qrPlateStand.js'

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

export function qrCaptionRings(design, fontBuffer) {
  if (!design.opts.caption) return { rings: [], aspect: 0 }
  if (!(fontBuffer instanceof ArrayBuffer)) throw new Error('Font untuk tulisan belum tersedia')
  const font = parse(fontBuffer)
  for (const char of design.opts.caption) {
    if (char.trim() && !font.charToGlyph(char).index) throw new Error(`Font tidak mendukung karakter “${char}” — pilih font lain`)
  }
  const path = new Path()
  let cursor = 0, previous = null
  for (const char of design.opts.caption) {
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

export function buildQrPlate(wasm, input, fontBuffer = null) {
  const design = createQrPlateDesign(input)
  const caption = qrCaptionRings(design, fontBuffer)
  const { opts, widthMm, depthMm, qrCenterY, moduleMm, runs, holes, cornerRadiusMm: radius } = design
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
    const qrRings = runs.map(([col, row, length]) => {
      const x = -opts.qrSizeMm / 2 + (col + 4) * moduleMm
      const y = qrCenterY + opts.qrSizeMm / 2 - (row + 5) * moduleMm
      // A 0.01 mm corner relief separates diagonal-only contacts. Without it,
      // two raised QR cells share a vertical edge and legacy slicers report
      // a non-manifold surface, even when they are attached to the same base.
      const w = length * moduleMm, h = moduleMm, c = 0.01
      return [[x+c,y], [x+w-c,y], [x+w,y+c], [x+w,y+h-c],
        [x+w-c,y+h], [x+c,y+h], [x,y+h-c], [x,y+c]]
    })
    const detail = track(new CrossSection(qrRings, 'NonZero'))
    let decoration = null
    const captionScale = caption.rings.length ? Math.min(opts.captionHeightMm, opts.qrSizeMm / caption.aspect) : 0
    if (captionScale && captionScale < 2) throw new Error('Tulisan terlalu kecil — pendekkan tulisan atau perbesar QR')
    const captionCenterY = design.captionCenterY
    if (caption.rings.length) {
      const section = track(new CrossSection(caption.rings.map((ring) => ring.map(([x, y]) => [x * captionScale, y * captionScale + captionCenterY])), 'NonZero'))
      decoration = section
    }
    const icon = qrIconContours(opts.iconId)
    if (icon.solid.length) {
      const positive = (rings) => rings.map((ring) => {
        const area = ring.reduce((sum, [x, y], i) => { const [nx, ny] = ring[(i + 1) % ring.length]; return sum + x * ny - nx * y }, 0)
        return area < 0 ? [...ring].reverse() : ring
      })
      const solids = icon.solid.flat()
      const minX = Math.min(...solids.map((p) => p[0])), maxX = Math.max(...solids.map((p) => p[0]))
      const minY = Math.min(...solids.map((p) => p[1])), maxY = Math.max(...solids.map((p) => p[1]))
      const scale = Math.min(opts.iconSizeMm, opts.qrSizeMm) / Math.max(maxX - minX, maxY - minY)
      const map = (rings) => positive(rings).map((ring) => ring.map(([x, y]) => [(x - (minX + maxX)/2) * scale, (y - (minY + maxY)/2) * scale + design.iconCenterY]))
      let section = track(new CrossSection(map(icon.solid), 'NonZero'))
      if (icon.holes.length) section = track(section.subtract(track(new CrossSection(map(icon.holes), 'NonZero'))))
      if (icon.extra?.length) section = track(section.add(track(new CrossSection(map(icon.extra), 'NonZero'))))
      decoration = decoration ? track(decoration.add(section)) : section
      design.icon = { solid: positive(icon.solid), holes: positive(icon.holes), extra: positive(icon.extra || []), bounds: { minX, maxX, minY, maxY } }
    }
    const detailZ = opts.surfaceMode === 'inlay' ? opts.baseThicknessMm - opts.detailHeightMm : opts.baseThicknessMm
    const detailSolid = track(track(Manifold.extrude(detail, opts.detailHeightMm)).translate([0, 0, detailZ]))
    const decorationSolid = decoration ? track(track(Manifold.extrude(decoration, opts.detailHeightMm)).translate([0, 0, detailZ])) : null
    // A white QR panel is embedded in the coloured frame; the border and lower
    // icon band remain dark, as on the reference desk plaques.
    const panelDepth = Math.min(opts.baseThicknessMm - 0.8, Math.max(1, opts.detailHeightMm + 0.2))
    const panel = track(track(CrossSection.square([opts.qrSizeMm, opts.qrSizeMm], true)).translate([0, qrCenterY]))
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
      design: { ...design, caption },
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
