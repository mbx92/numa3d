/**
 * Preset & opsi Lightbox Maker — terinspirasi Bambu Lab MakerWorld Lightbox Maker.
 * Front multi-layer warna + cavity LED + back panel.
 */

export const DESIGN_MODES = [
  { id: 'image', label: 'Gambar', description: 'Upload PNG/JPG — kuantisasi warna otomatis' },
  { id: 'text', label: 'Teks', description: 'Teks dengan font — latar putih + warna huruf' },
  { id: 'svg', label: 'SVG', description: 'Logo vektor — frame mengikuti siluet' },
  { id: 'svg-qr', label: 'QR SVG', description: 'QR code — frame rapi + ruang stand' }
]

/** Layout khusus lightbox QR (bukan siluet modul). */
export const QR_LIGHTBOX = {
  /** Jarak QR ↔ tepi dalam frame (mm). */
  frameGapMm: 2,
  /** Padding ekstra bawah agar lip stand tidak menutupi QR / teks. */
  standClearanceMm: 12,
  /** Jarak QR ↔ caption (mm). */
  captionGapMm: 2,
  /** Tinggi maks. caption (mm). */
  captionMaxHeightMm: 8
}

export const CABLE_HOLE_SIDES = [
  { id: 'bottom', label: 'Bawah' },
  { id: 'left', label: 'Kiri' },
  { id: 'right', label: 'Kanan' },
  { id: 'back', label: 'Belakang (tengah)' }
]

export const STAND_PRESETS = [
  { id: 'cradle', label: 'Cradle', description: 'Stand meja klasik — slot U dengan bibir & stop samping' },
  { id: 'wide', label: 'Wide', description: 'Cradle lebar penuh — lebar mengikuti frame lightbox' },
  { id: 'lean', label: 'Lean', description: 'Kickstand miring — sandaran belakang seperti frame foto' },
  { id: 'pedestal', label: 'Pedestal', description: 'Base lebar + tiang tengah — tampilan premium' },
  { id: 'clip', label: 'Clip', description: 'Profil rendah — bibir depan minimal' },
  { id: 'wall', label: 'Wall', description: 'Bracket dinding — slot vertikal pas body' },
  { id: 'none', label: 'Tanpa stand', description: 'Hanya lightbox, tanpa stand meja' }
]

export const STAND_PRESET_DEFAULTS = {
  cradle: { standWidthMm: 0, standDepthMm: 34, standBaseHeightMm: 4, standRailHeightMm: 8, standSlotMm: 0 },
  wide: { standWidthMm: 0, standDepthMm: 38, standBaseHeightMm: 5, standRailHeightMm: 10, standSlotMm: 0 },
  lean: { standWidthMm: 0, standDepthMm: 42, standBaseHeightMm: 3, standRailHeightMm: 14, standSlotMm: 0 },
  pedestal: { standWidthMm: 0, standDepthMm: 36, standBaseHeightMm: 4, standRailHeightMm: 12, standSlotMm: 0 },
  clip: { standWidthMm: 0, standDepthMm: 30, standBaseHeightMm: 2.5, standRailHeightMm: 5, standSlotMm: 0 },
  wall: { standWidthMm: 0, standDepthMm: 18, standBaseHeightMm: 3, standRailHeightMm: 0, standSlotMm: 0 },
  none: { standWidthMm: 0, standDepthMm: 0, standBaseHeightMm: 0, standRailHeightMm: 0, standSlotMm: 0 }
}

export function getStandPreset(id) {
  return STAND_PRESETS.find((p) => p.id === id) || STAND_PRESETS[0]
}

export function applyStandPreset(modelId, target = {}) {
  const preset = STAND_PRESET_DEFAULTS[modelId] || STAND_PRESET_DEFAULTS.cradle
  const next = { ...target, standModelId: modelId, ...preset }
  next.standEnabled = modelId !== 'none'
  return next
}

/** Hitung dimensi stand otomatis agar pas dengan body lightbox. */
export function resolveStandFit(opts, outerW, outerD, lightboxThickness) {
  // 0.8 terlalu ketat di FDM; ~2 mm absorb toleransi cetak / elephant foot
  const clearance = 2.0
  const autoSlot = lightboxThickness + clearance
  const maxSlot =
    opts.standModelId === 'wall'
      ? autoSlot + 6
      : // jangan clamp di bawah ketebalan+clearance (dulu clip sering kekunci maxSlot < autoSlot)
        Math.max(autoSlot, (opts.standDepthMm || 34) - 6)
  const slotMm = Math.min(Math.max(opts.standSlotMm > 0 ? opts.standSlotMm : autoSlot, 4), maxSlot)

  let autoWidth = outerW * 0.82
  if (opts.standModelId === 'wide') autoWidth = outerW + 4
  else if (opts.standModelId === 'lean') autoWidth = outerW + 8
  else if (opts.standModelId === 'pedestal') autoWidth = Math.max(outerW * 0.55, 48)
  else if (opts.standModelId === 'clip') autoWidth = outerW * 0.78
  else if (opts.standModelId === 'wall') autoWidth = outerW + 2
  else autoWidth = Math.min(Math.max(autoWidth, 58), outerW + 18)

  const standW = opts.standWidthMm > 0 ? opts.standWidthMm : autoWidth
  return { standW, slotMm, outerW, outerD, lightboxThickness }
}

export const LIGHTBOX_DEFAULTS = {
  label: 'Lightbox',
  designMode: 'text',
  text: 'NUMA',
  fontUrl: '/fonts/Roboto-Bold.woff',
  svgContent: '',
  imageDataUrl: '',
  maxSizeMm: 80,
  maxColors: 4,
  outerWidthMm: 100,
  outerDepthMm: 100,
  borderMm: 4,
  cornerRadiusMm: 4,
  backLayerDepthMm: 1.2,
  colorLayerDepthMm: 0.6,
  backPanelMm: 2,
  backCavityDepthMm: 14,
  wallThicknessMm: 2,
  diffuserEnabled: false,
  diffuserDepthMm: 0.6,
  diffuserColor: '#ffffff',
  ledStripEnabled: true,
  ledStripWidthMm: 5,
  ledStripColor: '#f6c343',
  ledLightColor: '#fff1a8',
  standEnabled: true,
  standModelId: 'cradle',
  standWidthMm: 0,
  standDepthMm: 34,
  standBaseHeightMm: 4,
  standRailHeightMm: 8,
  standSlotMm: 0,
  standColor: '#20242c',
  cableHoleMm: 5,
  cableHoleSide: 'bottom',
  hangingHoleMm: 0,
  hangingHoleOffsetMm: 10,
  colors: {
    frame: '#1a1a2e',
    back: '#0f0f1a',
    background: '#f5f5f5',
    text: '#e94560'
  },
  layerColors: []
}

export function resolveLightboxOptions(userOpts = {}) {
  const numberOr = (value, fallback) => {
    if (value === '' || value == null) return fallback
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const colors = { ...LIGHTBOX_DEFAULTS.colors, ...(userOpts.colors || {}) }
  const maxColors = Math.min(Math.max(Number(userOpts.maxColors) || 4, 2), 8)
  const backLayerDepthMm = Math.max(Number(userOpts.backLayerDepthMm) || 1.2, 0.4)
  const colorLayerDepthMm = Math.max(Number(userOpts.colorLayerDepthMm) || 0.6, 0.3)
  const backPanelMm = Math.max(Number(userOpts.backPanelMm) || 2, 1)
  const backCavityDepthMm = Math.max(Number(userOpts.backCavityDepthMm) || 14, 6)
  const wallThicknessMm = Math.max(Number(userOpts.wallThicknessMm) || 2, 1.2)
  const diffuserDepthMm = Math.min(Math.max(Number(userOpts.diffuserDepthMm) || 0.6, 0.2), 2)
  const ledStripWidthMm = Math.min(Math.max(Number(userOpts.ledStripWidthMm) || 5, 2), 8)
  const standModelId = STAND_PRESETS.some((p) => p.id === userOpts.standModelId)
    ? userOpts.standModelId
    : LIGHTBOX_DEFAULTS.standModelId
  const standPreset = STAND_PRESET_DEFAULTS[standModelId] || STAND_PRESET_DEFAULTS.cradle
  const standWidthMm = Math.max(numberOr(userOpts.standWidthMm, standPreset.standWidthMm), 0)
  const standDepthMm =
    standModelId === 'none'
      ? 0
      : Math.min(Math.max(numberOr(userOpts.standDepthMm, standPreset.standDepthMm), 14), 70)
  const standBaseHeightMm =
    standModelId === 'none'
      ? 0
      : Math.min(Math.max(numberOr(userOpts.standBaseHeightMm, standPreset.standBaseHeightMm), 1.5), 12)
  const standRailHeightMm =
    standModelId === 'none'
      ? 0
      : Math.min(Math.max(numberOr(userOpts.standRailHeightMm, standPreset.standRailHeightMm), 0), 20)
  const standSlotMm = Math.max(numberOr(userOpts.standSlotMm, standPreset.standSlotMm), 0)
  const borderMm =
    userOpts.designMode === 'svg-qr'
      ? 0
      : Math.max(Number(userOpts.borderMm) || 4, 1)
  const cornerRadiusMm = Math.max(Number(userOpts.cornerRadiusMm) || 4, 0)
  const cableHoleMm = Math.max(Number(userOpts.cableHoleMm) || 0, 0)
  const hangingHoleMm = Math.max(Number(userOpts.hangingHoleMm) || 0, 0)
  const hangingHoleOffsetMm = Math.max(Number(userOpts.hangingHoleOffsetMm) || 10, 4)
  const maxSizeMm = Math.min(Math.max(Number(userOpts.maxSizeMm) || 80, 30), 150)

  return {
    ...LIGHTBOX_DEFAULTS,
    ...userOpts,
    maxColors,
    maxSizeMm,
    backLayerDepthMm,
    colorLayerDepthMm,
    backPanelMm,
    backCavityDepthMm,
    wallThicknessMm,
    diffuserEnabled: !!userOpts.diffuserEnabled,
    diffuserDepthMm,
    diffuserColor: userOpts.diffuserColor || LIGHTBOX_DEFAULTS.diffuserColor,
    ledStripEnabled: userOpts.ledStripEnabled !== false,
    ledStripWidthMm,
    ledStripColor: userOpts.ledStripColor || LIGHTBOX_DEFAULTS.ledStripColor,
    ledLightColor: userOpts.ledLightColor || LIGHTBOX_DEFAULTS.ledLightColor,
    standEnabled: standModelId === 'none' ? false : userOpts.standEnabled !== false,
    standModelId,
    standWidthMm,
    standDepthMm,
    standBaseHeightMm,
    standRailHeightMm,
    standSlotMm,
    standColor: userOpts.standColor || LIGHTBOX_DEFAULTS.standColor,
    borderMm,
    cornerRadiusMm,
    cableHoleMm,
    hangingHoleMm,
    hangingHoleOffsetMm,
    colors,
    layerColors: Array.isArray(userOpts.layerColors) ? userOpts.layerColors : []
  }
}

export function validateLightboxSize(opts, designBounds) {
  const minW = (designBounds?.width || 30) + opts.borderMm * 2 + opts.wallThicknessMm * 2
  const minD = (designBounds?.height || 30) + opts.borderMm * 2 + opts.wallThicknessMm * 2
  if (opts.outerWidthMm < minW - 0.01 || opts.outerDepthMm < minD - 0.01) {
    throw new Error(`Ukuran frame terlalu kecil — minimal ${minW.toFixed(1)} × ${minD.toFixed(1)} mm`)
  }
}
