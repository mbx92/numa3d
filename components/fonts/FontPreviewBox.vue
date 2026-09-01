<script setup>
const props = defineProps({
  family: { type: String, required: true },
  variant: { type: String, default: '400' },
  text: { type: String, default: '' },
  sizeClass: { type: String, default: 'text-2xl' },
  loading: { type: Boolean, default: false }
})

const googlePreview = useGoogleFontPreview()

const displayText = computed(() => props.text || props.family)
const fontStyle = computed(() => googlePreview.styleFor(props.family))
const isLoading = computed(() => props.loading || googlePreview.loading.value)

watch(
  () => [props.family, props.variant],
  ([family, variant]) => {
    if (family) googlePreview.loadFamily(family, variant || '400')
  },
  { immediate: true }
)
</script>

<template>
  <div class="relative min-h-[4.5rem] flex flex-col items-center justify-center gap-2 p-4">
    <p
      class="text-center break-words max-w-full leading-tight transition-opacity duration-300"
      :class="[sizeClass, isLoading ? 'opacity-30' : 'opacity-100']"
      :style="fontStyle"
    >
      {{ displayText }}
    </p>
    <p class="text-xs text-ink-400 font-sans" :style="fontStyle">Aa Bb Cc 0123</p>
    <p v-if="isLoading" class="absolute inset-0 flex items-center justify-center text-xs text-ink-400 bg-ink-50/80 rounded-panel">
      Memuat preview…
    </p>
  </div>
</template>
