/**
 * Preset & opsi Lightbox Maker — terinspirasi Bambu Lab MakerWorld Lightbox Maker.
 * Front multi-layer warna + cavity LED + back panel.
 */

export const DESIGN_MODES = [
  { id: 'image', label: 'Gambar', description: 'Upload PNG/JPG — kuantisasi warna otomatis' },
  { id: 'text', label: 'Teks', description: 'Teks dengan font — latar putih + warna huruf' },
  { id: 'svg', label: 'SVG', description: 'Logo vektor — warna dari fill path SVG' }
]

export const CABLE_HOLE_SIDES = [
  { id: 'bottom', label: 'Bawah' },
  { id: 'left', label: 'Kiri' },
  { id: 'right', label: 'Kanan' },
  { id: 'back', label: 'Belakang (tengah)' }
]

export const LIGHTBOX_DEFAULTS = {
  label: 'Lightbox',
  designMode: 'text',
  text: 'NUMA',
  fontUrl: '/fonts/BarlowCondensed-Black.woff',
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
  cableHoleMm: 5,
  cableHoleSide: 'bottom',
  colors: {
    frame: '#1a1a2e',
    back: '#0f0f1a',
    background: '#f5f5f5',
    text: '#e94560'
  },
  layerColors: []
}

export function resolveLightboxOptions(userOpts = {}) {
  const colors = { ...LIGHTBOX_DEFAULTS.colors, ...(userOpts.colors || {}) }
  const maxColors = Math.min(Math.max(Number(userOpts.maxColors) || 4, 2), 8)
  const backLayerDepthMm = Math.max(Number(userOpts.backLayerDepthMm) || 1.2, 0.4)
  const colorLayerDepthMm = Math.max(Number(userOpts.colorLayerDepthMm) || 0.6, 0.3)
  const backPanelMm = Math.max(Number(userOpts.backPanelMm) || 2, 1)
  const backCavityDepthMm = Math.max(Number(userOpts.backCavityDepthMm) || 14, 6)
  const wallThicknessMm = Math.max(Number(userOpts.wallThicknessMm) || 2, 1.2)
  const borderMm = Math.max(Number(userOpts.borderMm) || 4, 1)
  const cornerRadiusMm = Math.max(Number(userOpts.cornerRadiusMm) || 4, 0)
  const cableHoleMm = Math.max(Number(userOpts.cableHoleMm) || 0, 0)
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
    borderMm,
    cornerRadiusMm,
    cableHoleMm,
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
