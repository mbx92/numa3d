<script setup>
import { DEFAULT_MATERIAL_COLOR, parseMaterialColor } from '~/utils/materialColor.js'

const props = defineProps({
  modelValue: { type: String, default: DEFAULT_MATERIAL_COLOR }
})
const emit = defineEmits(['update:modelValue'])

const color = computed({
  get: () => parseMaterialColor(props.modelValue),
  set: (v) => emit('update:modelValue', parseMaterialColor(v))
})

function onHexInput(event) {
  const v = event.target.value.trim()
  if (/^#[0-9a-fA-F]{3,6}$/.test(v)) color.value = v
}
</script>

<template>
  <div class="flex items-center gap-2">
    <input
      v-model="color"
      type="color"
      class="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-ink-200 bg-white p-0.5"
      :title="color"
    />
    <input
      :value="color"
      type="text"
      class="input font-mono text-sm w-[7.5rem]"
      maxlength="7"
      spellcheck="false"
      autocomplete="off"
      placeholder="#9ca3af"
      @input="onHexInput"
    />
  </div>
</template>
