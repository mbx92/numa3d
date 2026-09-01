/**
 * Preset dimensi switch keyboard — nilai nominal industri (mm).
 */

export const SHAPE_MODES = [
  { id: 'rect', label: 'Kotak', description: 'Bentuk persegi sederhana' },
  { id: 'svg', label: 'SVG', description: 'Upload logo / ikon vektor' },
  { id: 'text', label: 'Teks', description: 'Huruf atau kata sebagai lid' }
]

export const DISPLAY_MODES = [
  { id: 'preview', label: 'Preview', description: 'Tampilan perakitan — lid di atas base' },
  { id: 'print', label: 'Print', description: 'Lid dibalik — wajah cetak menghadap bawah' }
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
    clipEngageDepthMm: 3.5,
    pinDiameterMm: 2.8,
    pinSpacingMm: 4.5
  }
}

export const SWITCH_PRESET_LIST = Object.values(SWITCH_PRESETS)

export const CLICKER_DEFAULTS = {
  label: 'Clicker',
  shapeMode: 'rect',
  text: 'CLICK',
  fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
  svgContent: '',
  maxSizeMm: 40,
  displayMode: 'preview',
  switchPresetId: 'cherry_mx',
  fitToleranceMm: 0.15,
  outerWidthMm: 34,
  outerDepthMm: 34,
  outerHeightMm: 18,
  floorThicknessMm: 2.0,
  topRimMm: 2.5,
  wallThicknessMm: 2.5,
  bodyPaddingMm: 4,
  lidHeightMm: 10,
  lidInsetMm: 1.2,
  stemHoleMm: 4.2,
  keyringEnabled: false,
  keyringHoleMm: 4.5,
  keyringTabMm: 10,
  pinReliefEnabled: false,
  colors: {
    base: '#2d3748',
    lid: '#f5a623',
    floor: '#1a202c'
  }
}

export function getSwitchPreset(id) {
  return SWITCH_PRESETS[id] || SWITCH_PRESETS.cherry_mx
}

export function resolveClickerOptions(userOpts = {}) {
  const preset = getSwitchPreset(userOpts.switchPresetId)
  const tol = Number(userOpts.fitToleranceMm)
  const fitToleranceMm = Number.isFinite(tol) ? tol : CLICKER_DEFAULTS.fitToleranceMm

  const floorThicknessMm = Number(userOpts.floorThicknessMm) || CLICKER_DEFAULTS.floorThicknessMm
  const topRimMm = Number(userOpts.topRimMm) || CLICKER_DEFAULTS.topRimMm
  const wallThicknessMm = Number(userOpts.wallThicknessMm) || CLICKER_DEFAULTS.wallThicknessMm
  const housingPocketMm = preset.housingOuterMm + fitToleranceMm * 2
  const minOuterH = floorThicknessMm + preset.bodyDepthMm + topRimMm
  const outerHeightMm = Math.max(Number(userOpts.outerHeightMm) || CLICKER_DEFAULTS.outerHeightMm, minOuterH)

  const colors = { ...CLICKER_DEFAULTS.colors, ...(userOpts.colors || {}) }
  if (userOpts.colors?.accent && !userOpts.colors?.lid) colors.lid = userOpts.colors.accent

  return {
    ...CLICKER_DEFAULTS,
    ...userOpts,
    switchPresetId: preset.id,
    preset,
    fitToleranceMm,
    floorThicknessMm,
    topRimMm,
    wallThicknessMm,
    outerHeightMm,
    housingPocketMm,
    switchDepthMm: preset.bodyDepthMm + fitToleranceMm,
    plateOpeningMm: preset.plateCutoutMm + fitToleranceMm * 2,
    colors
  }
}

export function validateOuterSize(opts) {
  const pocket = opts.housingPocketMm
  const wall = opts.wallThicknessMm
  const minW = pocket + wall * 2 + (opts.bodyPaddingMm || 4) * 2
  if (opts.outerWidthMm < minW - 0.01 || opts.outerDepthMm < minW - 0.01) {
    throw new Error(`Ukuran base terlalu kecil — minimal ${minW.toFixed(1)} mm untuk preset ini`)
  }
}
