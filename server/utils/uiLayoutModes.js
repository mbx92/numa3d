const DEVICE_TIERS = ['iphone', 'ipad', 'macbook', 'desktop']

const LAYOUT_MODE_OPTIONS = {
  iphone: [
    { id: 'stacked', label: 'Stacked', description: 'Tab scroll, form, lalu preview di bawah.' },
    { id: 'preview-first', label: 'Preview dulu', description: 'Preview di atas; panel minimized default.' },
    { id: 'minimal', label: 'Minimal', description: 'Panel minimized; fokus preview & legend ringkas.' }
  ],
  ipad: [
    { id: 'classic', label: 'Classic', description: 'Sidebar icon + flyout + preview (seperti desktop).' },
    { id: 'split', label: 'Split', description: 'Form & preview berdampingan saat layar cukup lebar.' },
    { id: 'stacked', label: 'Stacked', description: 'Tab scroll vertikal — nyaman portrait.' }
  ],
  macbook: [
    { id: 'full', label: 'Full', description: 'Sidebar + flyout lebar + preview.' },
    { id: 'compact', label: 'Compact', description: 'Flyout lebih sempit; preview lebih luas.' },
    { id: 'preview-focus', label: 'Preview focus', description: 'Preview dominan, panel ringkas.' }
  ],
  desktop: [
    { id: 'full', label: 'Full', description: 'Layout tiga kolom penuh.' },
    { id: 'comfortable', label: 'Comfortable', description: 'Flyout medium, preview luas.' },
    { id: 'wide-preview', label: 'Wide preview', description: 'Preview maksimal untuk monitor besar.' }
  ]
}

export const DEFAULT_UI_LAYOUT_MODES = {
  iphone: 'preview-first',
  ipad: 'stacked',
  macbook: 'compact',
  desktop: 'full'
}

export function normalizeUiLayoutModes(raw) {
  const next = { ...DEFAULT_UI_LAYOUT_MODES }
  if (!raw || typeof raw !== 'object') return next
  for (const tier of DEVICE_TIERS) {
    const mode = String(raw[tier] || '').trim()
    const allowed = LAYOUT_MODE_OPTIONS[tier].some((opt) => opt.id === mode)
    if (allowed) next[tier] = mode
  }
  return next
}

export function parseUiLayoutModesBody(body) {
  const raw = body?.uiLayoutModes ?? body?.ui_layout_modes
  return normalizeUiLayoutModes(typeof raw === 'object' && raw ? raw : DEFAULT_UI_LAYOUT_MODES)
}

export function isValidUiLayoutModes(modes) {
  return DEVICE_TIERS.every((tier) => LAYOUT_MODE_OPTIONS[tier].some((opt) => opt.id === modes[tier]))
}
