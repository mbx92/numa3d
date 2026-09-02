import { detectDeviceTier } from '~/utils/uiLayoutModes.js'

export function useDeviceTier() {
  const tier = ref('desktop')

  function update() {
    if (import.meta.client) {
      tier.value = detectDeviceTier(window.innerWidth)
    }
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update, { passive: true })
  })

  onUnmounted(() => {
    if (import.meta.client) window.removeEventListener('resize', update)
  })

  return tier
}
