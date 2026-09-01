/**
 * Theme generator keychain — setiap theme = font + warna + parameter geometri.
 * Theme pertama: "SHAREN 77" sports italic + plate insert + base cavity.
 */
export const KEYCHAIN_THEMES = {
  sharen77: {
    id: 'sharen77',
    name: 'Sports Italic',
    description: 'Bold italic condens + plate insert + base cavity (seperti SHAREN 77)',
    fontUrl: '/fonts/BarlowCondensed-BlackItalic.woff',
    fontLabel: 'Barlow Condensed Black Italic',
    license: 'OFL — aman untuk komersial',
    typographyId: 'sports',
    insertMode: 'plate',
    colors: {
      plate: '#2b2b2b',
      letter: '#f0f0f0',
      accent: '#f5a623',
      base: '#8b9199',
      baseBottom: '#8b9199',
      baseHighlight: '#b8bec6',
      cavityFloor: '#5c6570',
      cavityWall: '#4a5568',
      cavityEdge: '#0f1419'
    },
    defaults: {
      text: 'NUMA 3D',
      accentIndices: [],
      attachmentType: 'hole',
      targetWidthMm: 68,
      targetHeightMm: 21,
      baseThicknessMm: 3.6,
      textThicknessMm: 3.12,
      floorThicknessMm: 0.4,
      topClearanceMm: 0.08,
      plateOuterMarginMm: 1.5,
      plateInnerBridgeMm: 2.5,
      cavityClearanceMm: 0.18,
      paddingMm: 1.8,
      eyeletOuterDiameterMm: 8,
      eyeletOverlapMm: 1.8,
      keyringHoleDiameterMm: 4.5,
      ledgeWidthMm: 0.55,
      hookOuterDiameterMm: 8,
      hookThicknessMm: 2.2,
      hookGapDegrees: 48,
      letterSpacingMm: -0.3
    }
  }
}

export const KEYCHAIN_THEME_LIST = Object.values(KEYCHAIN_THEMES)

export function getKeychainTheme(id) {
  return KEYCHAIN_THEMES[id] || KEYCHAIN_THEMES.sharen77
}

export function themeToGeneratorOptions(themeId, overrides = {}) {
  const theme = getKeychainTheme(themeId)
  const defaults = { ...theme.defaults }
  if (defaults.plateOuterMarginMm == null && defaults.plateMarginMm != null) {
    defaults.plateOuterMarginMm = defaults.plateMarginMm
  }
  if (defaults.plateInnerBridgeMm == null && defaults.plateGapBridgeMm != null) {
    defaults.plateInnerBridgeMm = defaults.plateGapBridgeMm
  }
  if (defaults.eyeletOverlapMm == null && defaults.eyeletInsetMm != null) {
    defaults.eyeletOverlapMm = defaults.eyeletInsetMm
  }
  const colors = { ...theme.colors, ...(overrides.colors || {}) }
  return {
    themeId: theme.id,
    fontUrl: theme.fontUrl,
    typographyId: overrides.typographyId ?? theme.typographyId ?? 'straight',
    insertMode: theme.insertMode || 'plate',
    ...defaults,
    ...overrides,
    colors
  }
}
