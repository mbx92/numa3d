/**
 * Model typography keychain — mengatur jarak huruf, kemiringan, skala, dan layout lengkung.
 */
export const KEYCHAIN_TYPOGRAPHY = {
  straight: {
    id: 'straight',
    name: 'Lurus',
    description: 'Horizontal standar — netral & mudah dibaca',
    letterSpacingMm: 0,
    scaleX: 1,
    scaleY: 1,
    slantDeg: 0,
    layout: 'straight'
  },
  sports: {
    id: 'sports',
    name: 'Sports',
    description: 'Condensed miring — gaya jersey / racing',
    letterSpacingMm: -0.35,
    scaleX: 0.94,
    scaleY: 1,
    slantDeg: -12,
    layout: 'straight'
  },
  condensed: {
    id: 'condensed',
    name: 'Rapat',
    description: 'Tracking ketat untuk teks panjang',
    letterSpacingMm: -0.75,
    scaleX: 0.9,
    scaleY: 1,
    slantDeg: 0,
    layout: 'straight'
  },
  expanded: {
    id: 'expanded',
    name: 'Lebar',
    description: 'Tracking longgar — tampilan premium',
    letterSpacingMm: 1.4,
    scaleX: 1.06,
    scaleY: 1,
    slantDeg: 0,
    layout: 'straight'
  },
  bold: {
    id: 'bold',
    name: 'Tebal',
    description: 'Vertikal sedikit lebih tinggi — kesan bold',
    letterSpacingMm: -0.15,
    scaleX: 1,
    scaleY: 1.1,
    slantDeg: 0,
    layout: 'straight'
  },
  italic: {
    id: 'italic',
    name: 'Miring',
    description: 'Shear italic tanpa ganti font',
    letterSpacingMm: -0.1,
    scaleX: 1,
    scaleY: 1,
    slantDeg: -15,
    layout: 'straight'
  },
  arcUp: {
    id: 'arcUp',
    name: 'Lengkung ↑',
    description: 'Teks melengkung ke atas',
    letterSpacingMm: 0.2,
    scaleX: 1,
    scaleY: 1,
    slantDeg: 0,
    layout: 'arc',
    arcSpanDeg: 28,
    arcDepthMm: 2.4,
    arcDirection: 1
  },
  arcDown: {
    id: 'arcDown',
    name: 'Lengkung ↓',
    description: 'Teks melengkung ke bawah',
    letterSpacingMm: 0.2,
    scaleX: 1,
    scaleY: 1,
    slantDeg: 0,
    layout: 'arc',
    arcSpanDeg: 28,
    arcDepthMm: 2.4,
    arcDirection: -1
  },
  wave: {
    id: 'wave',
    name: 'Gelombang',
    description: 'Baseline bergelombang halus',
    letterSpacingMm: 0.15,
    scaleX: 1,
    scaleY: 1,
    slantDeg: 0,
    layout: 'wave',
    waveAmplitudeMm: 1.4,
    waveCycles: 1
  }
}

export const KEYCHAIN_TYPOGRAPHY_LIST = Object.values(KEYCHAIN_TYPOGRAPHY)

/** Transform tambahan untuk huruf aksen (otomatis jika ada aksen dipilih). */
export const KEYCHAIN_ACCENT_TYPO_DEFAULTS = {
  scaleX: 1.18,
  scaleY: 1.24,
  baselineLiftMm: 0.55,
  slantDegExtra: -3
}

export function getKeychainTypography(id) {
  return KEYCHAIN_TYPOGRAPHY[id] || KEYCHAIN_TYPOGRAPHY.straight
}

/** Gabungkan preset typography — spacing & transform dari preset, bukan theme defaults. */
export function resolveTypography(typographyId) {
  const preset = getKeychainTypography(typographyId || 'straight')
  return {
    ...preset,
    typographyId: preset.id,
    letterSpacingMm: preset.letterSpacingMm ?? 0
  }
}

export function hasAccentGroups(groups) {
  return groups.some((g) => g.accent)
}

/** Aktifkan transform aksen jika ada huruf aksen di teks. */
export function resolveAccentTypography(accentIndices) {
  const enabled = Array.isArray(accentIndices) && accentIndices.length > 0
  return { enabled, ...KEYCHAIN_ACCENT_TYPO_DEFAULTS }
}

/** Typography per karakter — huruf aksen dapat skala & lift berbeda. */
export function resolveGroupTypography(typo, group, accentTypo) {
  if (!group?.accent || !accentTypo?.enabled) {
    return { ...typo, baselineLiftMm: 0 }
  }
  return {
    ...typo,
    scaleX: (typo.scaleX ?? 1) * (accentTypo.scaleX ?? 1),
    scaleY: (typo.scaleY ?? 1) * (accentTypo.scaleY ?? 1),
    slantDeg: (typo.slantDeg ?? 0) + (accentTypo.slantDegExtra ?? 0),
    baselineLiftMm: accentTypo.baselineLiftMm ?? 0
  }
}

/** CSS transform untuk preview UI (bukan 1:1 dengan mesh 3D). */
export function typographyPreviewStyle(id) {
  const t = getKeychainTypography(id)
  const parts = []
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${t.scaleX}, ${t.scaleY})`)
  if (t.slantDeg) parts.push(`skewX(${t.slantDeg}deg)`)
  if (t.layout === 'arc') {
    const dir = t.arcDirection ?? 1
    parts.push(`translateY(${dir > 0 ? '-2px' : '2px'})`)
  }
  if (t.layout === 'wave') parts.push('translateY(-1px)')
  return {
    transform: parts.join(' ') || 'none',
    letterSpacing: `${Math.max(-0.15, Math.min(0.35, t.letterSpacingMm * 0.08))}em`
  }
}
