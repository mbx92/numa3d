<script setup>
import { ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  font: { type: Object, default: null },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  anchor: { type: Object, default: null },
  previewText: { type: String, default: 'NUMA 3D' },
  selectedVariant: { type: String, default: '400' },
  isAdmin: { type: Boolean, default: false },
  downloading: { type: Boolean, default: false }
})

const emit = defineEmits(['update:selectedVariant', 'download', 'download-file', 'mouseenter', 'mouseleave'])

const googlePreview = useGoogleFontPreview()

const cardStyle = computed(() => {
  if (!import.meta.client || !props.anchor) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const gap = 12
  const cardW = 320
  const cardH = 360
  let left = props.anchor.right + gap
  let top = props.anchor.top

  if (left + cardW > window.innerWidth - 16) {
    left = props.anchor.left - cardW - gap
  }
  if (left < 16) left = 16

  top = Math.min(Math.max(top, 16), window.innerHeight - cardH - 16)

  return { top: `${top}px`, left: `${left}px` }
})

function variantLabel(key) {
  const names = {
    100: 'Thin',
    200: 'Extra Light',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Semi Bold',
    700: 'Bold',
    800: 'Extra Bold',
    900: 'Black'
  }
  const italic = String(key).endsWith('i')
  const weight = italic ? key.slice(0, -1) : key
  const label = names[weight] || weight
  return italic ? `${label} Italic` : label
}

watch(
  () => [props.font?.family, props.selectedVariant],
  ([family, variant]) => {
    if (family) googlePreview.loadFamily(family, variant || '400')
  },
  { immediate: true }
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="font"
        class="fixed z-[60] w-80 pointer-events-auto"
        :style="cardStyle"
        @mouseenter="emit('mouseenter')"
        @mouseleave="emit('mouseleave')"
      >
        <div class="panel shadow-xl border border-ink-200 ring-1 ring-ink-900/5 overflow-hidden">
          <div class="px-4 py-3 border-b border-ink-100 bg-gradient-to-r from-accent-50/80 to-white">
            <p class="text-sm font-semibold text-ink-900 font-sans truncate">{{ font.family }}</p>
            <p class="text-[11px] text-ink-500 mt-0.5">
              {{ detail?.category || font.category }} · {{ detail?.variants?.length || font.variants?.length }} varian
            </p>
          </div>

          <div class="p-4 space-y-3">
            <div v-if="loading" class="text-sm text-ink-500 text-center py-6">Memuat preview…</div>
            <template v-else>
              <div
                class="rounded-panel border border-ink-200 bg-ink-50 px-4 py-5 min-h-[5.5rem] flex items-center justify-center"
              >
                <p
                  class="text-2xl text-center break-words max-w-full leading-tight"
                  :style="googlePreview.styleFor(font.family)"
                >
                  {{ previewText }}
                </p>
              </div>
              <p class="text-xs text-ink-400 text-center font-sans" :style="googlePreview.styleFor(font.family)">
                Aa Bb Cc 0123 · NUMA 3D
              </p>

              <div v-if="detail?.variants?.length">
                <label class="label">Varian</label>
                <select
                  :value="selectedVariant"
                  class="input text-sm"
                  @change="emit('update:selectedVariant', $event.target.value)"
                >
                  <option v-for="v in detail.variants" :key="v" :value="v">{{ variantLabel(v) }}</option>
                </select>
              </div>

              <div v-if="detail" class="space-y-2">
                <button
                  type="button"
                  class="btn-primary w-full text-sm"
                  :disabled="downloading"
                  @click="emit('download-file')"
                >
                  <ArrowDownTrayIcon class="w-4 h-4" />
                  {{ downloading ? 'Mengunduh…' : 'Unduh file' }}
                </button>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="btn-secondary w-full text-sm"
                  :disabled="downloading"
                  @click="emit('download')"
                >
                  {{ downloading ? 'Menyimpan…' : 'Simpan ke server' }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
