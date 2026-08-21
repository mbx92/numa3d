<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' }, // md | lg | xl
  nested: { type: Boolean, default: false }
})
defineEmits(['close'])

const widthClass = computed(() => {
  if (props.size === 'xl') return 'sm:max-w-5xl'
  if (props.size === 'lg') return 'sm:max-w-3xl'
  return 'sm:max-w-lg'
})
const zClass = computed(() => (props.nested ? 'z-[110]' : 'z-[100]'))
const panelRef = ref(null)

// Kunci scroll halaman selama modal terbuka; di PWA keyboard tidak boleh
// menggeser/memperbesar layout di belakang modal.
let prevOverflow = ''
let prevOverscroll = ''
onMounted(() => {
  if (props.nested || !import.meta.client) return
  prevOverflow = document.body.style.overflow
  prevOverscroll = document.body.style.overscrollBehavior
  document.body.style.overflow = 'hidden'
  document.body.style.overscrollBehavior = 'none'
})
onUnmounted(() => {
  if (props.nested || !import.meta.client) return
  document.body.style.overflow = prevOverflow
  document.body.style.overscrollBehavior = prevOverscroll
})

function onFocusIn(e) {
  const el = e.target
  if (!(el instanceof HTMLElement)) return
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
  // Tunggu keyboard/viewport settle, lalu pastikan field terlihat di dalam panel.
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    }, 250)
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 flex items-end sm:items-center justify-center overflow-hidden overscroll-none"
      :class="zClass"
      style="height: 100dvh; max-height: 100dvh"
    >
      <div class="absolute inset-0 bg-ink-950/50" @click="$emit('close')"></div>
      <div
        ref="panelRef"
        class="relative panel w-full overflow-y-auto overscroll-contain rounded-b-none sm:rounded-panel sm:m-4 pb-safe"
        :class="widthClass"
        style="max-height: min(92dvh, 100dvh)"
        @focusin="onFocusIn"
      >
        <div class="panel-header sticky top-0 bg-white z-10">
          <span class="panel-title">{{ title }}</span>
          <button class="text-ink-400 hover:text-ink-700 text-xl leading-none px-1" @click="$emit('close')">
            &times;
          </button>
        </div>
        <div class="p-4">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
