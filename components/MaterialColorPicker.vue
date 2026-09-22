<script setup>
import { ChevronDownIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { DEFAULT_MATERIAL_COLOR, materialSwatchColor, parseMaterialColor } from '~/utils/materialColor.js'
import { materialTypeBadge, materialTypeLabel } from '~/utils/materialType.js'
import { filamentFilterTabs, filterFilamentMaterials } from '~/utils/filamentTypes.js'

const props = defineProps({
  materialId: { type: [Number, String], default: null },
  hex: { type: String, default: DEFAULT_MATERIAL_COLOR },
  label: { type: String, default: 'Warna' },
  materialType: { type: String, default: 'filament' },
  size: { type: String, default: 'md' },
  materials: { type: Array, default: null },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

const toolMaterials = props.materials ? null : useToolMaterials()

const open = ref(false)
const root = ref(null)
const dialog = ref(null)
const selectedFilamentType = ref('all')
const paletteId = useId()

const options = computed(() => props.materials ?? toolMaterials.filterByType(props.materialType ?? 'filament'))
const selected = computed(() => options.value.find((material) => Number(material.id) === Number(props.materialId)) || null)
const showFilamentTabs = computed(() => (props.materialType ?? 'filament') === 'filament')
const localFilamentTypes = computed(() => [...new Map((props.materials || [])
  .filter((material) => material.filamentTypeId != null && material.filamentTypeName)
  .map((material) => [material.filamentTypeId, { id: material.filamentTypeId, name: material.filamentTypeName }])).values()])
const filamentTabs = computed(() => filamentFilterTabs(props.materials ? localFilamentTypes.value : toolMaterials.filamentTypes.value, options.value))
const filteredOptions = computed(() => showFilamentTabs.value ? filterFilamentMaterials(options.value, selectedFilamentType.value) : options.value)
watch(filamentTabs, (tabs) => {
  if (!tabs.some((tab) => tab.id === selectedFilamentType.value)) selectedFilamentType.value = 'all'
})
watch(open, async (visible) => {
  if (visible && toolMaterials) await Promise.allSettled([toolMaterials.refresh(), toolMaterials.refreshFilamentTypes()])
})

function navigateTab(event, index) {
  const length = filamentTabs.value.length
  const next = event.key === 'ArrowRight' ? (index + 1) % length : event.key === 'ArrowLeft' ? (index + length - 1) % length : event.key === 'Home' ? 0 : event.key === 'End' ? length - 1 : null
  if (next == null) return
  event.preventDefault()
  selectedFilamentType.value = filamentTabs.value[next].id
  event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus()
}

const swatchHex = computed(() =>
  selected.value ? materialSwatchColor(selected.value) || parseMaterialColor(props.hex) : parseMaterialColor(props.hex)
)

const buttonSize = computed(() => (props.size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'))

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function close() {
  open.value = false
}

function pick(material) {
  if (props.disabled || (props.materials && Number(material.stockQuantity) <= 0)) return
  emit('select', material)
  close()
}

function onDocClick(event) {
  if (!open.value || !root.value) return
  if (!root.value.contains(event.target) && !dialog.value?.contains(event.target)) close()
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
      :disabled="disabled"
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
          ref="dialog"
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

          <div v-if="showFilamentTabs" role="tablist" aria-label="Jenis filament" class="flex gap-1 overflow-x-auto border-b border-ink-100 px-3 py-2">
            <button
              v-for="(tab, index) in filamentTabs" :id="`${paletteId}-tab-${tab.id}`" :key="tab.id"
              type="button" role="tab" :aria-selected="selectedFilamentType === tab.id" :aria-controls="`${paletteId}-panel`"
              :tabindex="selectedFilamentType === tab.id ? 0 : -1"
              class="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium"
              :class="selectedFilamentType === tab.id ? 'bg-accent-500 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'"
              @click="selectedFilamentType = tab.id" @keydown="navigateTab($event, index)"
            >{{ tab.label }} <span class="opacity-70">{{ tab.count }}</span></button>
          </div>

          <div :id="`${paletteId}-panel`" :role="showFilamentTabs ? 'tabpanel' : undefined" :aria-labelledby="showFilamentTabs ? `${paletteId}-tab-${selectedFilamentType}` : undefined">
          <div v-if="!options.length" class="px-4 py-8 text-center text-sm text-amber-700">
            Belum ada material {{ materialTypeLabel(materialType).toLowerCase() }}. Tambah di halaman Material.
          </div>
          <p v-else-if="!filteredOptions.length" class="px-4 py-8 text-center text-sm text-ink-500">Belum ada warna untuk jenis filament ini.</p>

          <div v-else class="max-h-[min(24rem,60vh)] overflow-y-auto p-3">
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="m in filteredOptions"
                :key="m.id"
                type="button"
                :disabled="materials && Number(m.stockQuantity) <= 0"
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
                    {{ m.filamentTypeName || materialTypeLabel(m.type) }}
                  </span>
                </span>
                <span class="mt-1 text-[10px] font-mono text-ink-400">{{ m.color || 'tanpa swatch' }}</span>
                <span v-if="materials" class="mt-1 text-[10px] text-ink-400">Stok {{ Number(m.stockQuantity).toFixed(1) }} g</span>
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
      </div>
    </Teleport>
  </div>
</template>
