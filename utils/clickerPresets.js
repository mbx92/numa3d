/**
 * Preset dimensi switch keyboard — nilai nominal industri (mm).
 * Parameter mekanik mengikuti referensi Vostok Labs clicker-generator.
 */

export const SHAPE_MODES = [
  { id: 'rect', label: 'Shape', description: 'Tile per huruf dengan shape pilihan' },
  { id: 'svg', label: 'SVG', description: 'Upload logo / ikon vektor' },
  { id: 'text', label: 'Teks', description: 'Huruf atau kata sebagai lid' }
]

export const BASE_SHAPES = [
  { id: 'outline', label: 'Outline', description: 'Base mengikuti siluet desain' },
  { id: 'circle', label: 'Lingkaran', description: 'Base bulat mengelilingi desain' },
  { id: 'square', label: 'Kotak', description: 'Persegi dengan sudut membulat' },
  { id: 'rect', label: 'Persegi panjang', description: 'Proporsi mengikuti desain' },
  { id: 'hexagon', label: 'Heksagon', description: 'Enam sisi' },
  { id: 'heart', label: 'Hati', description: 'Bentuk hati' },
  { id: 'star', label: 'Bintang', description: 'Bintang 5 sudut' },
  { id: 'egg', label: 'Telur', description: 'Oval telur' }
]

export const BASE_SHAPE_IDS = BASE_SHAPES.map((shape) => shape.id)
export const TILE_BASE_SHAPE_IDS = ['circle', 'square', 'rect']

export const KEYRING_POSITIONS = [
  { id: 'left', label: 'Kiri', angleDeg: 270 },
  { id: 'top', label: 'Atas', angleDeg: 0 }
]

export const DISPLAY_MODES = [
  { id: 'preview', label: 'Preview', description: 'Lid terpasang di dalam well' },
  { id: 'exploded', label: 'Exploded', description: 'Lid terangkat untuk melihat detail' },
  { id: 'print', label: 'Print', description: 'Layout plat — lid di samping base' }
]

export const SWITCH_PRESETS = {
  cherry_mx: {
    id: 'cherry_mx',
    name: 'Cherry MX',
    description: 'Standar MX — Cherry, Gateron, Outemu, Akko, KTT, dll.',
    housingOuterMm: 18.5,
    bodyDepthMm: 11.5,
    plateCutoutMm: 14.0,
    stemBossMm: 5.6,
    stemHeightMm: 4.0,
    clipEngageDepthMm: 4.2,
    pinDiameterMm: 3.05,
    pinSpacingMm: 5.08
  },
  kailh_box: {
    id: 'kailh_box',
    name: 'Kailh Box',
    description: 'Kailh Box — footprint sedikit lebih kecil.',
    housingOuterMm: 18.2,
    bodyDepthMm: 11.3,
    plateCutoutMm: 14.0,
    stemBossMm: 5.4,
    stemHeightMm: 3.8,
    clipEngageDepthMm: 4.0,
    pinDiameterMm: 3.0,
    pinSpacingMm: 5.08
  },
  kailh_choc: {
    id: 'kailh_choc',
    name: 'Kailh Choc',
    description: 'Choc v1 — footprint 16×16 mm.',
    housingOuterMm: 16.0,
    bodyDepthMm: 9.2,
    plateCutoutMm: 12.0,
    stemBossMm: 4.8,
    stemHeightMm: 3.2,
    clipEngageDepthMm: 3.5,
    pinDiameterMm: 2.8,
    pinSpacingMm: 4.5
  }
}

export const SWITCH_PRESET_LIST = Object.values(SWITCH_PRESETS)

export const CLICKER_DEFAULTS = {
  label: 'Clicker',
  shapeMode: 'rect',
  baseShape: 'outline',
  text: 'CLICK',
  fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
  svgContent: '',
  maxSizeMm: 40,
  displayMode: 'preview',
  switchPresetId: 'cherry_mx',
  fitToleranceMm: 0.15,
  slipToleranceMm: 0.4,
  stemFitPct: 0,
  socketFitPct: 0,
  capProudMm: 4.0,
  travelMm: 4.0,
  imageMarginMm: 1.2,
  borderWidthMm: 2.6,
  topThicknessMm: 1.5,
  imageDepthMm: 0.8,
  skirtThicknessMm: 1.4,
  outerWidthMm: 35,
  outerDepthMm: 35,
  outerHeightMm: 18,
  floorThicknessMm: 1.6,
  topRimMm: 2.5,
  wallThicknessMm: 2.5,
  bodyPaddingMm: 4,
  lidHeightMm: 10,
  lidInsetMm: 1.2,
  stemHoleMm: 4.2,
  keyringEnabled: false,
  keyringHoleMm: 5.2,
  keyringTabMm: 10,
  keyringAngleDeg: 270,
  pinReliefEnabled: false,
  colors: {
    base: '#2d3748',
    lid: '#f5a623',
    text: '#111827',
    floor: '#1a202c'
  }
}

export function getSwitchPreset(id) {
  return SWITCH_PRESETS[id] || SWITCH_PRESETS.cherry_mx
}

export function resolveClickerOptions(userOpts = {}) {
  const preset = getSwitchPreset(userOpts.switchPresetId)
  const fitToleranceMm = Number.isFinite(Number(userOpts.fitToleranceMm))
    ? Number(userOpts.fitToleranceMm)
    : CLICKER_DEFAULTS.fitToleranceMm
  const slipToleranceMm = Number(userOpts.slipToleranceMm) || CLICKER_DEFAULTS.slipToleranceMm
  const stemFitPct = Number(userOpts.stemFitPct) || 0
  const socketFitPct = Number(userOpts.socketFitPct) || 0

  const floorThicknessMm = Number(userOpts.floorThicknessMm) || CLICKER_DEFAULTS.floorThicknessMm
  const topRimMm = Number(userOpts.topRimMm) || CLICKER_DEFAULTS.topRimMm
  const wallThicknessMm = Number(userOpts.wallThicknessMm) || CLICKER_DEFAULTS.wallThicknessMm
  const travelMm = Number(userOpts.travelMm) || CLICKER_DEFAULTS.travelMm
  const capProudMm = Number(userOpts.capProudMm) || CLICKER_DEFAULTS.capProudMm

  const socketScale = 1 + socketFitPct / 100
  const housingPocketMm = preset.housingOuterMm * socketScale + fitToleranceMm * 2
  const plateOpeningMm = preset.plateCutoutMm * socketScale + fitToleranceMm * 2
  const switchDepthMm = preset.bodyDepthMm + fitToleranceMm
  const stemBossMm = preset.stemBossMm * (1 + stemFitPct / 100)
  const stemHeightMm = preset.stemHeightMm || 4.0

  const minOuterH = floorThicknessMm + switchDepthMm + topRimMm + travelMm * 0.25
  const outerHeightMm = Math.max(Number(userOpts.outerHeightMm) || CLICKER_DEFAULTS.outerHeightMm, minOuterH)

  const colors = { ...CLICKER_DEFAULTS.colors, ...(userOpts.colors || {}) }
  if (userOpts.colors?.accent && !userOpts.colors?.text) colors.text = userOpts.colors.accent
  const allowedBaseShapes = userOpts.shapeMode === 'rect' ? TILE_BASE_SHAPE_IDS : BASE_SHAPE_IDS
  const baseShape = allowedBaseShapes.includes(userOpts.baseShape)
    ? userOpts.baseShape
    : (userOpts.shapeMode === 'rect' ? 'square' : CLICKER_DEFAULTS.baseShape)

  const isText = userOpts.shapeMode === 'text'
  const imageMarginMm = Number(userOpts.imageMarginMm) || (isText ? 2.5 : CLICKER_DEFAULTS.imageMarginMm)
  const borderWidthMm = Number(userOpts.borderWidthMm) || (isText ? 3.5 : CLICKER_DEFAULTS.borderWidthMm)

  return {
    ...CLICKER_DEFAULTS,
    ...userOpts,
    baseShape,
    switchPresetId: preset.id,
    preset,
    fitToleranceMm,
    slipToleranceMm,
    stemFitPct,
    socketFitPct,
    floorThicknessMm,
    topRimMm,
    wallThicknessMm,
    travelMm,
    capProudMm,
    imageMarginMm,
    borderWidthMm,
    outerHeightMm,
    housingPocketMm,
    switchDepthMm,
    plateOpeningMm,
    stemBossMm,
    stemHeightMm,
    colors
  }
}

export function validateOuterSize(opts) {
  const pocket = opts.housingPocketMm
  const border = opts.borderWidthMm || 2.6
  const tol = opts.slipToleranceMm || 0.4
  const minW = pocket + border * 2 + tol * 2 + 2
  if (opts.outerWidthMm < minW - 0.01 || opts.outerDepthMm < minW - 0.01) {
    throw new Error(`Ukuran base terlalu kecil — minimal ${minW.toFixed(1)} mm untuk preset ini`)
  }
}
