<script setup>
import { DEFAULT_MATERIAL_COLOR, parseMaterialColor } from '~/utils/materialColor.js'
import MaterialColorPicker from '~/components/MaterialColorPicker.vue'

const props = defineProps({
  /** @type {{ key: string, label: string, short?: string, hint?: string, materialType?: string|null, isAccent?: boolean }[]} */
  fields: { type: Array, required: true },
  colors: { type: Object, required: true },
  mode: { type: String, default: 'hex' },
  materialIds: { type: Object, default: () => ({}) },
  /** compact = toolbar, list = wizard */
  variant: { type: String, default: 'compact' },
  showModeSwitch: { type: Boolean, default: true }
})

const emit = defineEmits(['update:colors', 'update:mode', 'update:materialIds', 'change'])

const { materialsWithColor, hexFromMaterial } = useToolMaterials()

const modes = [
  { id: 'hex', label: 'Hex' },
  { id: 'material', label: 'Material' }
]

function setMode(next) {
  emit('update:mode', next)
  emit('change')
}

function onHexInput(key, event) {
  const value = event.target.value
  const nextColors = { ...props.colors, [key]: value }
  const nextIds = { ...props.materialIds }
  delete nextIds[key]
  emit('update:colors', nextColors)
  emit('update:materialIds', nextIds)
  emit('change')
}

function onMaterialSelect(key, material) {
  const nextIds = { ...props.materialIds, [key]: material.id }
  const hex = hexFromMaterial(material) || DEFAULT_MATERIAL_COLOR
  emit('update:materialIds', nextIds)
  emit('update:colors', { ...props.colors, [key]: hex })
  emit('change')
}

const pickerSize = computed(() => (props.variant === 'list' ? 'md' : 'sm'))
</script>

<template>
  <ClientOnly>
    <div class="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div
        v-if="showModeSwitch"
        class="flex rounded-md border border-ink-200 overflow-hidden text-[10px] shrink-0"
        role="tablist"
        aria-label="Sumber warna"
      >
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          role="tab"
          :aria-selected="mode === m.id"
          class="px-2 py-1 transition-colors border-l border-ink-200 first:border-l-0"
          :class="mode === m.id ? 'bg-ink-800 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'"
          @click="setMode(m.id)"
        >
          {{ m.label }}
        </button>
      </div>

      <p
        v-if="mode === 'material' && !materialsWithColor.length"
        class="text-[10px] text-amber-700 w-full basis-full"
      >
        Belum ada material dengan warna — atur di halaman Material.
      </p>

      <div
        class="flex flex-wrap items-center gap-2"
        :class="variant === 'list' ? 'w-full flex-col items-stretch gap-3' : ''"
      >
        <div
          v-for="field in fields"
          :key="field.key"
          :class="
            variant === 'list'
              ? 'rounded-lg border border-ink-100 p-3 space-y-2'
              : 'group relative flex flex-col items-center gap-0.5 min-w-[5.5rem]'
          "
        >
          <template v-if="mode === 'hex'">
            <label
              :class="variant === 'list' ? 'flex items-center gap-3 cursor-pointer w-full' : 'cursor-pointer flex flex-col items-center gap-0.5'"
            >
              <input
                :value="colors[field.key]"
                type="color"
                :class="
                  variant === 'list'
                    ? 'h-10 w-10 shrink-0 rounded-md border border-ink-200 cursor-pointer'
                    : 'h-7 w-7 cursor-pointer rounded-md border-2 border-white shadow-sm ring-1 transition-transform group-hover:scale-105 ' +
                      (field.isAccent ? 'ring-amber-400 ring-2' : 'ring-ink-200')
                "
                @input="onHexInput(field.key, $event)"
              />
              <span v-if="variant === 'list'" class="min-w-0">
                <span class="block text-xs font-medium text-ink-800">{{ field.label }}</span>
                <span v-if="field.hint" class="block text-[10px] text-ink-400">{{ field.hint }}</span>
                <span v-else class="block text-[10px] font-mono text-ink-400">{{ colors[field.key] }}</span>
              </span>
              <span v-else class="text-[9px] text-ink-500 leading-none">{{ field.short || field.label }}</span>
            </label>
          </template>

          <template v-else>
            <span
              v-if="variant === 'list'"
              class="block text-xs font-medium text-ink-800"
            >
              {{ field.label }}
            </span>
            <span v-if="variant === 'list' && field.hint" class="block text-[10px] text-ink-400 -mt-1">
              {{ field.hint }}
            </span>
            <MaterialColorPicker
              :material-id="materialIds[field.key] ?? null"
              :hex="parseMaterialColor(colors[field.key])"
              :label="field.label"
              :material-type="field.materialType ?? 'filament'"
              :size="pickerSize"
              @select="onMaterialSelect(field.key, $event)"
            />
            <span
              v-if="variant !== 'list'"
              class="text-[9px] text-ink-500 leading-none text-center truncate w-full"
            >
              {{ field.short || field.label }}
            </span>
          </template>
        </div>
      </div>
    </div>
    <template #fallback>
      <div class="flex flex-wrap items-center gap-2" aria-hidden="true">
        <div
          v-for="field in fields"
          :key="field.key"
          class="rounded-md border border-ink-200 bg-ink-100"
          :class="variant === 'list' ? 'h-10 w-10' : 'h-7 w-7'"
          :style="{ backgroundColor: colors[field.key] || '#e5e7eb' }"
        />
      </div>
    </template>
  </ClientOnly>
</template>
