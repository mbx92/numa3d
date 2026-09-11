/**
 * Preset dimensi switch keyboard — nilai nominal industri (mm).
 * Parameter mekanik mengikuti referensi Vostok Labs clicker-generator.
 */

export const SHAPE_MODES = [
  { id: 'rect', label: 'Shape', description: 'Tile per huruf dengan shape pilihan' },
  { id: 'svg', label: 'SVG', description: 'Upload logo / ikon vektor' },
  { id: 'text', label: 'Teks', description: 'Huruf atau kata sebagai lid' },
  { id: 'mesh', label: 'Mesh', description: 'Model .3mf / .stl dari Galeri atau upload' }
]

export const BASE_SHAPES = [
  { id: 'outline', label: 'Outline', description: 'Base mengikuti siluet desain' },
  { id: 'circle', label: 'Lingkaran', description: 'Base bulat mengelilingi desain' },
  { id: 'square', label: 'Kotak', description: 'Persegi dengan sudut membulat' },
  { id: 'rect', label: 'Persegi panjang', description: 'Proporsi mengikuti desain' },
  { id: 'hexagon', label: 'Heksagon', description: 'Enam sisi' },
  { id: 'egg', label: 'Telur', description: 'Oval telur' }
]

export const BASE_SHAPE_IDS = BASE_SHAPES.map((shape) => shape.id)
export const TILE_BASE_SHAPE_IDS = ['circle', 'square', 'rect']

export const KEYRING_POSITIONS = [
  { id: 'left', label: 'Kiri', angleDeg: 270 },
  { id: 'top', label: 'Atas', angleDeg: 0 },
  { id: 'right', label: 'Kanan', angleDeg: 90 },
  { id: 'bottom', label: 'Bawah', angleDeg: 180 }
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

export const SWITCH_PREVIEW_MODELS = [
  {
    id: 'simple',
    name: 'Simple box',
    description: 'Preview ringan berbentuk housing dan stem sederhana.'
  },
  {
    id: 'hidden',
    name: 'Tanpa switch',
    description: 'Sembunyikan model switch di preview perakitan. Socket dan stem cetak tidak berubah.',
    hide: true
  }
]

export const SWITCH_PREVIEW_MODEL_IDS = SWITCH_PREVIEW_MODELS.map((model) => model.id)

export function getSwitchPreviewModel(id) {
  return SWITCH_PREVIEW_MODELS.find((model) => model.id === id) || SWITCH_PREVIEW_MODELS[0]
}

export const CLICKER_DEFAULTS = {
  label: 'Clicker',
  shapeMode: 'rect',
  baseShape: 'square',
  perLetterShapes: false,
  letterShapes: [],
  flexiEnabled: false,
  flexiConnectionStyle: 'hinge',
  flexiClearanceMm: 0.35,
  flexiStrapHoleMm: 3.2,
  text: 'CLICK',
  fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
  svgContent: '',
  meshBuffer: null,
  meshFilename: '',
  meshLibraryFileId: null,
  meshReliefHeightMm: 35,
  meshStemBuryMm: 2.5,
  maxSizeMm: 40,
  displayMode: 'preview',
  switchPresetId: 'cherry_mx',
  switchPreviewModelId: 'simple',
  fitToleranceMm: 0.15,
  slipToleranceMm: 0.4,
  stemFitPct: 0,
  socketFitPct: 0,
  capProudMm: 4.0,
  travelMm: 4.0,
  imageMarginMm: 1.2,
  borderWidthMm: 2.6,
  topThicknessMm: 1.5,
  imageDepthMm: 2,
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
  keyringStyle: 'loop',
  keyringHoleMm: 5.2,
  keyringTabMm: 12,
  keyringAngleDeg: 270,
  /** Clip kunci: inter-letter bottom rail + click latch (Shape, ≥2 glyphs, non-flexi). */
  snapFitEnabled: false,
  snapFitClearanceMm: 0.28,
  pinReliefEnabled: false,
  colors: {
    base: '#2d3748',
    lid: '#f5a623',
    text: '#111827',
    floor: '#1a202c'
  }
}

/** Defaults khusus tool Mesh → Clicker (split atas/bawah + switch). */
export const MESH_CLICKER_DEFAULTS = {
  ...CLICKER_DEFAULTS,
  label: 'Mesh Clicker',
  shapeMode: 'mesh',
  baseShape: 'outline',
  text: '',
  svgContent: '',
  meshBuffer: null,
  meshFilename: '',
  meshLibraryFileId: null,
  meshReliefHeightMm: 45,
  meshSplitLidRatio: 0.32,
  /** Fraksi AABB mesh: pusat (u,v) + ukuran (wu,wv). <1 = potong lokal. */
  meshSplitRegion: { u: 0.5, v: 0.5, wu: 1, wv: 1 },
  meshUpAxis: 'auto',
  meshSourceMode: 'split', // 'split' | 'parts'
  meshLidBuffer: null,
  meshLidFilename: '',
  meshBaseBuffer: null,
  meshBaseFilename: '',
  meshStemBuryMm: 2.5,
  fitToleranceMm: 0.25,
  maxSizeMm: 45,
  displayMode: 'preview',
  colors: {
    base: '#8b5a2b',
    lid: '#e8b86d',
    text: '#e8b86d',
    floor: '#5c3d1e'
  }
}

export function getSwitchPreset(id) {
  return SWITCH_PRESETS[id] || SWITCH_PRESETS.cherry_mx
}


/** Glyph characters from lid text (spaces ignored), matching footprint letter tiles. */
export function glyphCharsFromText(text) {
  return Array.from(String(text || '')).filter((ch) => ch.trim())
}

/** Keep letterShapes aligned with glyph tiles; pad with baseShape, trim extras. */
export function syncLetterShapes(text, letterShapes = [], baseShape = 'square') {
  const chars = glyphCharsFromText(text)
  const fallback = TILE_BASE_SHAPE_IDS.includes(baseShape) ? baseShape : 'square'
  const src = Array.isArray(letterShapes) ? letterShapes : []
  return chars.map((_, i) => (TILE_BASE_SHAPE_IDS.includes(src[i]) ? src[i] : fallback))
}

export function resolveClickerOptions(userOpts = {}) {
  const preset = getSwitchPreset(userOpts.switchPresetId)
  const switchPreviewModel = getSwitchPreviewModel(userOpts.switchPreviewModelId)
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
  const imageMarginMm = userOpts.imageMarginMm != null && Number.isFinite(Number(userOpts.imageMarginMm))
    ? Math.max(0, Number(userOpts.imageMarginMm))
    : (isText ? 2.5 : CLICKER_DEFAULTS.imageMarginMm)
  const borderWidthMm = Number(userOpts.borderWidthMm) || (isText ? 3.5 : CLICKER_DEFAULTS.borderWidthMm)
  const imageDepthMm = Number.isFinite(Number(userOpts.imageDepthMm))
    ? Math.max(0.4, Math.min(4, Number(userOpts.imageDepthMm)))
    : CLICKER_DEFAULTS.imageDepthMm

  return {
    ...CLICKER_DEFAULTS,
    ...userOpts,
    baseShape,
    perLetterShapes: userOpts.shapeMode === 'rect' && userOpts.perLetterShapes === true,
    letterShapes: userOpts.shapeMode === 'rect'
      ? syncLetterShapes(userOpts.text, userOpts.letterShapes, baseShape)
      : [],
    flexiEnabled: userOpts.shapeMode === 'rect' && userOpts.flexiEnabled === true,
    flexiConnectionStyle: userOpts.flexiConnectionStyle === 'strap' ? 'strap' : 'hinge',
    flexiClearanceMm: Number.isFinite(Number(userOpts.flexiClearanceMm))
      ? Math.max(0.2, Math.min(0.6, Number(userOpts.flexiClearanceMm)))
      : CLICKER_DEFAULTS.flexiClearanceMm,
    flexiStrapHoleMm: Number.isFinite(Number(userOpts.flexiStrapHoleMm))
      ? Math.max(2.5, Math.min(5, Number(userOpts.flexiStrapHoleMm)))
      : CLICKER_DEFAULTS.flexiStrapHoleMm,
    switchPresetId: preset.id,
    switchPreviewModelId: switchPreviewModel.id,
    switchPreviewModel,
    keyringEnabled:
      userOpts.shapeMode === 'rect'
      && userOpts.flexiEnabled !== true
      && userOpts.keyringEnabled === true,
    /** Clip kunci antar shape: rail bawah + latch klik (bukan gantungan, bukan flexi). */
    snapFitEnabled:
      userOpts.shapeMode === 'rect'
      && userOpts.flexiEnabled !== true
      && (userOpts.snapFitEnabled === true || userOpts.keyringLinkEnabled === true),
    snapFitClearanceMm: Number.isFinite(Number(userOpts.snapFitClearanceMm))
      ? Math.max(0.25, Math.min(0.35, Number(userOpts.snapFitClearanceMm)))
      : CLICKER_DEFAULTS.snapFitClearanceMm,
    /** @deprecated alias — same as snapFitEnabled */
    keyringLinkEnabled:
      userOpts.shapeMode === 'rect'
      && userOpts.flexiEnabled !== true
      && (userOpts.snapFitEnabled === true || userOpts.keyringLinkEnabled === true),
    keyringStyle: userOpts.keyringStyle === 'hole' ? 'hole' : 'loop',
    keyringHoleMm: Number.isFinite(Number(userOpts.keyringHoleMm))
      ? Math.max(3, Math.min(8, Number(userOpts.keyringHoleMm)))
      : CLICKER_DEFAULTS.keyringHoleMm,
    keyringAngleDeg: (() => {
      const raw = Number(userOpts.keyringAngleDeg)
      if (!Number.isFinite(raw)) return CLICKER_DEFAULTS.keyringAngleDeg
      const normalized = ((raw % 360) + 360) % 360
      const known = KEYRING_POSITIONS.map((p) => p.angleDeg)
      const nearest = known.reduce((best, angle) => {
        const d = Math.min(Math.abs(normalized - angle), 360 - Math.abs(normalized - angle))
        return d < best.d ? { angle, d } : best
      }, { angle: CLICKER_DEFAULTS.keyringAngleDeg, d: Infinity })
      return nearest.d <= 20 ? nearest.angle : normalized
    })(),
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
    imageDepthMm,
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
