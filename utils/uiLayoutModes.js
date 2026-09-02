export const DEVICE_TIERS = ['iphone', 'ipad', 'macbook', 'desktop']

export const DEVICE_TIER_LABELS = {
  iphone: 'iPhone / ponsel',
  ipad: 'iPad / tablet',
  macbook: 'MacBook / laptop',
  desktop: 'Desktop / monitor'
}

export const DEVICE_TIER_HINTS = {
  iphone: 'Lebar layar ≤ 767 px',
  ipad: '768 – 1023 px',
  macbook: '1024 – 1439 px',
  desktop: '≥ 1440 px'
}

export const DEFAULT_UI_LAYOUT_MODES = {
  iphone: 'preview-first',
  ipad: 'stacked',
  macbook: 'compact',
  desktop: 'full'
}

export const LAYOUT_MODE_OPTIONS = {
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

const PRESETS = {
  iphone: {
    stacked: {
      editorClass: 'flex-col',
      rail: 'horizontal',
      tabScroll: true,
      mobileChrome: true,
      panelCollapsedDefault: false,
      navOrder: 'order-2',
      asideOrder: 'order-3',
      previewOrder: 'order-4',
      collapsedOrder: 'order-2',
      flyoutClass: 'w-full',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0 min-h-[18rem]'
    },
    'preview-first': {
      editorClass: 'flex-col',
      rail: 'horizontal',
      tabScroll: true,
      mobileChrome: true,
      panelCollapsedDefault: true,
      navOrder: 'order-3',
      asideOrder: 'order-4',
      previewOrder: 'order-2',
      collapsedOrder: 'order-3',
      flyoutClass: 'w-full',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0 min-h-[14rem] sm:min-h-[20rem]'
    },
    minimal: {
      editorClass: 'flex-col',
      rail: 'horizontal',
      tabScroll: true,
      mobileChrome: true,
      panelCollapsedDefault: true,
      compactLegend: true,
      navOrder: 'order-3',
      asideOrder: 'order-4',
      previewOrder: 'order-2',
      collapsedOrder: 'order-3',
      flyoutClass: 'w-full',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0 min-h-[20rem]'
    }
  },
  ipad: {
    classic: {
      editorClass: 'flex-col md:flex-row',
      rail: 'vertical',
      tabScroll: true,
      mobileChrome: true,
      panelCollapsedDefault: false,
      navOrder: 'order-2 md:order-1',
      asideOrder: 'order-3 md:order-2',
      previewOrder: 'order-4 md:order-3',
      collapsedOrder: 'order-2',
      flyoutClass: 'w-full md:w-80 lg:w-[22rem]',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0'
    },
    split: {
      editorClass: 'flex-col md:flex-row',
      rail: 'horizontal',
      tabScroll: true,
      mobileChrome: true,
      panelCollapsedDefault: false,
      navOrder: 'order-2 md:order-1',
      asideOrder: 'order-3 md:order-2 md:max-w-[22rem]',
      previewOrder: 'order-4 md:order-3',
      collapsedOrder: 'order-2',
      flyoutClass: 'w-full md:w-80',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0 min-h-[16rem] md:min-h-0'
    },
    stacked: {
      editorClass: 'flex-col',
      rail: 'horizontal',
      tabScroll: true,
      mobileChrome: true,
      panelCollapsedDefault: false,
      navOrder: 'order-2',
      asideOrder: 'order-3',
      previewOrder: 'order-4',
      collapsedOrder: 'order-2',
      flyoutClass: 'w-full',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0 min-h-[20rem]'
    }
  },
  macbook: {
    full: {
      editorClass: 'flex-col md:flex-row',
      rail: 'vertical',
      tabScroll: false,
      mobileChrome: false,
      panelCollapsedDefault: false,
      navOrder: 'order-2 md:order-1',
      asideOrder: 'order-3 md:order-2',
      previewOrder: 'order-4 md:order-3',
      collapsedOrder: 'order-2 md:hidden',
      flyoutClass: 'w-full md:w-80 lg:w-[22rem]',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0'
    },
    compact: {
      editorClass: 'flex-col md:flex-row',
      rail: 'vertical',
      tabScroll: false,
      mobileChrome: false,
      panelCollapsedDefault: false,
      navOrder: 'order-2 md:order-1',
      asideOrder: 'order-3 md:order-2',
      previewOrder: 'order-4 md:order-3',
      collapsedOrder: 'order-2 md:hidden',
      flyoutClass: 'w-full md:w-72 lg:w-72',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0'
    },
    'preview-focus': {
      editorClass: 'flex-col md:flex-row',
      rail: 'vertical',
      tabScroll: false,
      mobileChrome: false,
      panelCollapsedDefault: false,
      navOrder: 'order-2 md:order-1',
      asideOrder: 'order-3 md:order-2 md:max-w-[18rem]',
      previewOrder: 'order-4 md:order-3',
      collapsedOrder: 'order-2 md:hidden',
      flyoutClass: 'w-full md:w-72',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0'
    }
  },
  desktop: {
    full: {
      editorClass: 'flex-col lg:flex-row',
      rail: 'vertical',
      tabScroll: false,
      mobileChrome: false,
      panelCollapsedDefault: false,
      navOrder: 'order-2 lg:order-1',
      asideOrder: 'order-3 lg:order-2',
      previewOrder: 'order-4 lg:order-3',
      collapsedOrder: 'order-2 lg:hidden',
      flyoutClass: 'w-full lg:w-80 xl:w-[22rem]',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0'
    },
    comfortable: {
      editorClass: 'flex-col lg:flex-row',
      rail: 'vertical',
      tabScroll: false,
      mobileChrome: false,
      panelCollapsedDefault: false,
      navOrder: 'order-2 lg:order-1',
      asideOrder: 'order-3 lg:order-2',
      previewOrder: 'order-4 lg:order-3',
      collapsedOrder: 'order-2 lg:hidden',
      flyoutClass: 'w-full lg:w-80',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0'
    },
    'wide-preview': {
      editorClass: 'flex-col lg:flex-row',
      rail: 'vertical',
      tabScroll: false,
      mobileChrome: false,
      panelCollapsedDefault: false,
      navOrder: 'order-2 lg:order-1',
      asideOrder: 'order-3 lg:order-2 lg:max-w-[20rem]',
      previewOrder: 'order-4 lg:order-3',
      collapsedOrder: 'order-2 lg:hidden',
      flyoutClass: 'w-full lg:w-72',
      previewClass: 'flex-1 min-w-0 flex flex-col min-h-0'
    }
  }
}

export function detectDeviceTier(width = 1024) {
  if (width <= 767) return 'iphone'
  if (width <= 1023) return 'ipad'
  if (width <= 1439) return 'macbook'
  return 'desktop'
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

export function resolveLayoutConfig(tier, modeId) {
  const mode = modeId || DEFAULT_UI_LAYOUT_MODES[tier]
  return PRESETS[tier]?.[mode] || PRESETS[tier]?.[DEFAULT_UI_LAYOUT_MODES[tier]]
}

export function layoutModeLabel(tier, modeId) {
  return LAYOUT_MODE_OPTIONS[tier]?.find((opt) => opt.id === modeId)?.label || modeId
}
