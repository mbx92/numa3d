import {
  DEFAULT_UI_LAYOUT_MODES,
  DEVICE_TIER_LABELS,
  layoutModeLabel,
  normalizeUiLayoutModes,
  resolveLayoutConfig
} from '~/utils/uiLayoutModes.js'

const settingsKey = 'app-settings-ui-layout'

export function useUiLayout() {
  const tier = useDeviceTier()
  const width = ref(1440)

  const { data: settings } = useFetch('/api/settings', {
    key: settingsKey,
    default: () => ({ uiLayoutModes: DEFAULT_UI_LAYOUT_MODES })
  })

  const uiLayoutModes = computed(() => normalizeUiLayoutModes(settings.value?.uiLayoutModes))

  const activeMode = computed(() => uiLayoutModes.value[tier.value] || DEFAULT_UI_LAYOUT_MODES[tier.value])

  const layoutConfig = computed(() => resolveLayoutConfig(tier.value, activeMode.value))

  const deviceLabel = computed(() => DEVICE_TIER_LABELS[tier.value] || tier.value)

  const modeLabel = computed(() => layoutModeLabel(tier.value, activeMode.value))

  function updateWidth() {
    if (import.meta.client) width.value = window.innerWidth
  }

  onMounted(() => {
    updateWidth()
    window.addEventListener('resize', updateWidth, { passive: true })
  })

  onUnmounted(() => {
    if (import.meta.client) window.removeEventListener('resize', updateWidth)
  })

  return {
    tier,
    width,
    uiLayoutModes,
    activeMode,
    layoutConfig,
    deviceLabel,
    modeLabel
  }
}
