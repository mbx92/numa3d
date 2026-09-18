<script setup>
import { DEFAULT_MATERIAL_COLOR, TOOL_MONO_COLOR, parseMaterialColor } from '~/utils/materialColor.js'
import { fillMissingToolMaterials } from '~/utils/toolMaterialDefaults.js'
import MaterialColorPicker from '~/components/MaterialColorPicker.vue'

const props = defineProps({
  /** @type {{ key: string, label: string, short?: string, hint?: string, materialType?: string|null, isAccent?: boolean }[]} */
  fields: { type: Array, required: true },
  colors: { type: Object, required: true },
  mode: { type: String, default: 'material' },
  materialIds: { type: Object, default: () => ({}) },
  /** compact = toolbar, list = wizard */
  variant: { type: String, default: 'compact' }
})

const emit = defineEmits(['update:colors', 'update:mode', 'update:materialIds', 'change'])

const { materials, hexFromMaterial } = useToolMaterials()

let applyingDefaults = false
watch(
  [materials, () => props.fields, () => props.materialIds],
  async () => {
    if (applyingDefaults || !materials.value.length) return
    const next = fillMissingToolMaterials({
      fields: props.fields,
      materialIds: props.materialIds,
      colors: props.colors,
      materials: materials.value
    })
    if (!next.changed) return
    applyingDefaults = true
    emit('update:materialIds', next.materialIds)
    emit('update:colors', next.colors)
    emit('change')
    await nextTick()
    applyingDefaults = false
  },
  { immediate: true, deep: true }
)

watch(() => props.mode, (mode) => {
  if (mode !== 'material') emit('update:mode', 'material')
}, { immediate: true })

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
      <p
        v-if="!materials.length"
        class="text-[10px] text-amber-700 w-full basis-full"
      >
        Belum ada material di database — tambah di halaman Material.
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
          <div v-if="variant === 'list'" class="flex items-center gap-1">
            <span class="text-xs font-medium text-ink-800">{{ field.label }}</span>
            <InfoTooltip v-if="field.hint" :label="`Informasi ${field.label}`">{{ field.hint }}</InfoTooltip>
          </div>
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
          :style="{ backgroundColor: colors[field.key] || TOOL_MONO_COLOR }"
        />
      </div>
    </template>
  </ClientOnly>
</template>
