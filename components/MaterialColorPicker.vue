<script setup>
import { ChevronDownIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { DEFAULT_MATERIAL_COLOR, materialSwatchColor, parseMaterialColor } from '~/utils/materialColor.js'
import { materialTypeBadge, materialTypeLabel } from '~/utils/materialType.js'

const props = defineProps({
  materialId: { type: [Number, String], default: null },
  hex: { type: String, default: DEFAULT_MATERIAL_COLOR },
  label: { type: String, default: 'Warna' },
  materialType: { type: String, default: 'filament' },
  size: { type: String, default: 'md' }
})

const emit = defineEmits(['select'])

const { filterByType, materialById } = useToolMaterials()

const open = ref(false)
const root = ref(null)

const options = computed(() => filterByType(props.materialType ?? 'filament'))
const selected = computed(() => materialById(props.materialId))

const swatchHex = computed(() =>
  selected.value ? materialSwatchColor(selected.value) || parseMaterialColor(props.hex) : parseMaterialColor(props.hex)
)

const buttonSize = computed(() => (props.size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'))

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function pick(material) {
  emit('select', material)
  close()
}

function onDocClick(event) {
  if (!open.value || !root.value) return
  if (!root.value.contains(event.target)) close()
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="relative min-w-0">
    <button
      type="button"
      class="group flex items-center gap-2 min-w-0 rounded-lg border border-ink-200 bg-white text-left transition-colors hover:border-ink-300 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
      :class="size === 'sm' ? 'p-1' : 'w-full px-2 py-2'"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click.stop="toggle"
    >
      <span
        class="shrink-0 rounded-md border border-ink-200 shadow-inner ring-1 ring-black/5"
        :class="buttonSize"
        :style="{ backgroundColor: swatchHex }"
      />
      <template v-if="size !== 'sm'">
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-ink-800 truncate">
            {{ selected?.name || 'Pilih material' }}
          </span>
          <span class="block text-[10px] font-mono text-ink-400 truncate">{{ swatchHex }}</span>
        </span>
        <ChevronDownIcon
          class="w-4 h-4 shrink-0 text-ink-400 transition-transform group-hover:text-ink-600"
          :class="open ? 'rotate-180' : ''"
        />
      </template>
      <ChevronDownIcon
        v-else
        class="w-3 h-3 shrink-0 text-ink-400"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-ink-950/30 backdrop-blur-[1px]"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          :aria-label="`Pilih material untuk ${label}`"
          class="w-full max-w-sm rounded-xl border border-ink-200 bg-white shadow-xl overflow-hidden"
          @click.stop
        >
          <div class="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-ink-900">Pilih material</p>
              <p class="text-xs text-ink-500 truncate">{{ label }} · {{ materialTypeLabel(materialType) }}</p>
            </div>
            <button
              type="button"
              class="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Tutup"
              @click="close"
            >
              <XMarkIcon class="w-5 h-5" />
            </button>
          </div>

          <div v-if="!options.length" class="px-4 py-8 text-center text-sm text-amber-700">
            Belum ada material {{ materialTypeLabel(materialType).toLowerCase() }}. Tambah di halaman Material.
          </div>

          <div v-else class="max-h-[min(24rem,60vh)] overflow-y-auto p-3">
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="m in options"
                :key="m.id"
                type="button"
                class="relative flex flex-col items-stretch rounded-lg border p-2.5 text-left transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                :class="
                  Number(materialId) === Number(m.id)
                    ? 'border-accent-500 bg-accent-50/60 ring-1 ring-accent-500/30'
                    : 'border-ink-200 bg-white hover:border-ink-300'
                "
                @click="pick(m)"
              >
                <span
                  class="mb-2 h-12 w-full rounded-md border border-ink-200/80 shadow-inner"
                  :style="{ backgroundColor: materialSwatchColor(m) || parseMaterialColor(null) }"
                />
                <span class="text-xs font-medium text-ink-800 leading-snug line-clamp-2">{{ m.name }}</span>
                <span class="mt-1 inline-flex">
                  <span class="badge text-[9px] px-1.5 py-0" :class="materialTypeBadge(m.type)">
                    {{ materialTypeLabel(m.type) }}
                  </span>
                </span>
                <span class="mt-1 text-[10px] font-mono text-ink-400">{{ m.color || 'tanpa swatch' }}</span>
                <span
                  v-if="Number(materialId) === Number(m.id)"
                  class="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-white shadow-sm"
                >
                  <CheckIcon class="w-3 h-3" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
