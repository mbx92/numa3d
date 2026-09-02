import {
  DEFAULT_UI_LAYOUT_MODES,
  DEVICE_TIERS,
  LAYOUT_MODE_OPTIONS,
  normalizeUiLayoutModes
} from '../../utils/uiLayoutModes.js'

export { DEFAULT_UI_LAYOUT_MODES, normalizeUiLayoutModes }

export function parseUiLayoutModesBody(body) {
  const raw = body?.uiLayoutModes ?? body?.ui_layout_modes
  return normalizeUiLayoutModes(typeof raw === 'object' && raw ? raw : DEFAULT_UI_LAYOUT_MODES)
}

export function isValidUiLayoutModes(modes) {
  return DEVICE_TIERS.every((tier) => LAYOUT_MODE_OPTIONS[tier].some((opt) => opt.id === modes[tier]))
}
