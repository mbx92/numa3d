// Footprint 2D clicker — plate → well → body (referensi Vostok Labs).
import * as THREE from 'three'
import { computeBoundsFromShapes } from './keychainTypographyCore.js'
import { offsetShapes, subtractShapes2D, unionTextBodies } from './shapeClipper.js'
import { makeRoundedRectShape } from './clickerBaseShapes.js'

export function boundsFromShapes(shapes) {
  if (!shapes?.length) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 }
  }
  return computeBoundsFromShapes(shapes)
}

/** Plate = siluet + margin; outline mode offset artwork. */
export function buildPlateShapes(footprint, opts) {
  const margin = Number(opts.imageMarginMm) || 1.2
  const raw = footprint.plateShapes?.length ? footprint.plateShapes : footprint.shapes || []
  if (!raw.length) return []

  if (opts.baseShape === 'outline' && opts.shapeMode !== 'rect') {
    const united = unionTextBodies(raw)
    const src = united.length ? united : raw
    const grown = offsetShapes(src, margin)
    return grown.length ? grown : src
  }
  return raw
}

/** Well = plate + slip tolerance + kolom clearance switch. */
export function buildWellShapes(plateShapes, opts) {
  const tol = Number(opts.slipToleranceMm) || 0.4
  const pocket = Number(opts.housingPocketMm) || 18.5
  const switchClear = pocket + 3
  let well = offsetShapes(plateShapes, tol)
  if (!well.length) well = plateShapes

  const guard = makeRoundedRectShape(switchClear / 2, switchClear / 2, 2.5)
  const merged = unionTextBodies([...well, guard])
  return merged.length ? merged : well
}

/** Body outer = well + bezel border. */
export function buildBodyShapes(wellShapes, opts) {
  const border = Number(opts.borderWidthMm) || 2.6
  const grown = offsetShapes(wellShapes, border)
  return grown.length ? grown : wellShapes
}

export function buildPocketShape(opts) {
  const pocket = Number(opts.housingPocketMm) || 18.5
  return makeRoundedRectShape(pocket / 2, pocket / 2, 2.5)
}

export function buildPlateOpeningShape(opts) {
  const open = Number(opts.plateOpeningMm) || 14
  return makeRoundedRectShape(open / 2, open / 2, 1.5)
}

/** Stem MX — post kotak + lubang silang (approx 3MF asset). */
export function buildStemShapes(opts) {
  const fit = Number(opts.stemFitPct) || 0
  const outer = 7.9
  const slotW = 4.2 * (1 + fit / 100)
  const slotT = 1.2 * (1 + fit / 100)
  const post = makeRoundedRectShape(outer / 2, outer / 2, 1.2)
  const barH = makeRoundedRectShape(slotW / 2, slotT / 2, 0.2)
  const barV = makeRoundedRectShape(slotT / 2, slotW / 2, 0.2)
  const withSlot = subtractShapes2D([post], unionTextBodies([barH, barV]))
  return withSlot.length ? withSlot : [post]
}

/** Skirt ring mengelilingi plate + stem guard (tanpa notch). */
export function buildSkirtRingShapes(plateShapes, opts) {
  const skirtT = Number(opts.skirtThicknessMm) || 1.4
  const stemGuard = 12 + skirtT * 2
  const guard = makeRoundedRectShape(stemGuard / 2, stemGuard / 2, 2)
  const base = unionTextBodies([...plateShapes, guard])
  if (!base.length) return []
  const inner = offsetShapes(base, -skirtT)
  if (!inner.length) return []
  return subtractShapes2D(base, inner)
}

export function resolveMechanicalFootprint(footprint, opts) {
  const plateShapes = buildPlateShapes(footprint, opts)
  const wellShapes = buildWellShapes(plateShapes, opts)
  const bodyShapes = buildBodyShapes(wellShapes, opts)
  const plateBounds = boundsFromShapes(plateShapes)
  const bodyBounds = boundsFromShapes(bodyShapes)

  return {
    ...footprint,
    plateShapes,
    wellShapes,
    bodyShapes,
    pocketShape: buildPocketShape(opts),
    plateOpeningShape: buildPlateOpeningShape(opts),
    plateBounds,
    bodyBounds,
    plateWidthMm: plateBounds.width,
    plateDepthMm: plateBounds.height,
    wellWidthMm: boundsFromShapes(wellShapes).width,
    wellDepthMm: boundsFromShapes(wellShapes).height,
    outerWidthMm: bodyBounds.width,
    outerDepthMm: bodyBounds.height
  }
}
