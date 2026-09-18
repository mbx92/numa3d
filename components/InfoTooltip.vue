<script setup>
import { InformationCircleIcon } from '@heroicons/vue/24/outline'

defineOptions({ inheritAttrs: false })

const props = defineProps({ label: { type: String, default: 'Informasi' } })
const id = useId()
const trigger = ref(null)
const popup = ref(null)
const visible = ref(false)
const position = ref({})
let closeTimer

function hide() {
  clearTimeout(closeTimer)
  visible.value = false
}
function keepOpen() { clearTimeout(closeTimer) }
function scroll(event) { if (!popup.value?.contains(event.target)) hide() }
function delayHide() {
  clearTimeout(closeTimer)
  closeTimer = setTimeout(hide, 150)
}
async function show() {
  clearTimeout(closeTimer)
  const bounds = trigger.value?.getBoundingClientRect()
  if (!bounds) return
  const width = Math.min(360, window.innerWidth - 24)
  const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))
  position.value = { width: `${width}px`, left: `${left}px`, top: `${bounds.bottom + 8}px`, maxHeight: `${window.innerHeight - 24}px` }
  visible.value = true
  await nextTick()
  if (!visible.value || !popup.value) return
  const height = popup.value.getBoundingClientRect().height
  const top = bounds.bottom + 8 + height <= window.innerHeight - 12
    ? bounds.bottom + 8 : Math.max(12, bounds.top - height - 8)
  position.value = { ...position.value, top: `${top}px` }
}
function outside(event) {
  if (!trigger.value?.contains(event.target) && !popup.value?.contains(event.target)) hide()
}
function keydown(event) { if (event.key === 'Escape') hide() }
onMounted(() => {
  window.addEventListener('pointerdown', outside)
  window.addEventListener('keydown', keydown)
  window.addEventListener('resize', hide)
  window.addEventListener('scroll', scroll, true)
})
onUnmounted(() => {
  hide()
  window.removeEventListener('pointerdown', outside)
  window.removeEventListener('keydown', keydown)
  window.removeEventListener('resize', hide)
  window.removeEventListener('scroll', scroll, true)
})
</script>

<template>
  <button
    ref="trigger"
    v-bind="$attrs"
    type="button"
    class="inline-flex shrink-0 items-center justify-center rounded-full p-1 text-ink-400 hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    :aria-label="props.label"
    :aria-describedby="visible ? id : undefined"
    @mouseenter="show"
    @mouseleave="delayHide"
    @focus="show"
    @blur="delayHide"
    @click="show"
  >
    <InformationCircleIcon class="h-4 w-4" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <div
      v-if="visible"
      :id="id"
      ref="popup"
      role="tooltip"
      class="fixed z-[200] overflow-y-auto rounded-lg border border-ink-200 bg-white p-3 text-xs font-normal leading-relaxed text-ink-600 shadow-lg space-y-2"
      :style="position"
      @mouseenter="keepOpen"
      @mouseleave="delayHide"
      @focusin="keepOpen"
      @focusout="delayHide"
    ><slot /></div>
  </Teleport>
</template>
