function readStandaloneDisplay() {
  if (!import.meta.client) return false
  if (window.navigator.standalone === true) return true
  for (const mode of ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']) {
    if (window.matchMedia(`(display-mode: ${mode})`).matches) return true
  }
  return false
}

/** PWA/standalone: navigasi in-app. Browser biasa: Tools boleh tab baru. */
export function useStandaloneDisplay() {
  // true dulu agar SSR + hydrate tanpa target=_blank (aman di PWA).
  const isStandalone = ref(true)

  const openToolInNewTab = computed(() => !isStandalone.value)

  const toolLinkAttrs = computed(() =>
    openToolInNewTab.value ? { target: '_blank', rel: 'noopener' } : {}
  )

  onMounted(() => {
    isStandalone.value = readStandaloneDisplay()
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = () => {
      isStandalone.value = readStandaloneDisplay()
    }
    mq.addEventListener?.('change', onChange)
    onUnmounted(() => mq.removeEventListener?.('change', onChange))
  })

  return { isStandalone, openToolInNewTab, toolLinkAttrs }
}
