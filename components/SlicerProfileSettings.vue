<script setup>
import { TOOL_PRINT_PROFILES, slicerProjectSettings } from '~/utils/slicerProjectSettings.js'

const props = defineProps({
  tool: { type: String, required: true },
  modelValue: { type: Boolean, default: true }
})
defineEmits(['update:modelValue'])
const profile = computed(() => TOOL_PRINT_PROFILES[props.tool])
const settings = computed(() => slicerProjectSettings(profile.value.id, 1))
</script>

<template>
  <section class="rounded-lg border border-ink-200 p-3 space-y-2 text-xs">
    <label class="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" class="mt-0.5" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" />
      <span>
        <span class="font-semibold block">Sertakan profil {{ profile.label }}</span>
        <span class="text-ink-500">Kobra X · nozzle 0,4 mm · PLA · textured plate</span>
      </span>
    </label>
    <template v-if="modelValue">
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt>Layer / pertama</dt><dd>{{ settings.layer_height }} / {{ settings.initial_layer_print_height }} mm</dd>
        <dt>Dinding / infill</dt><dd>{{ settings.wall_loops }} / {{ settings.sparse_infill_density }}</dd>
        <dt>Dinding luar / atas</dt><dd>{{ settings.outer_wall_speed }} / {{ settings.top_surface_speed }} mm/s</dd>
        <dt>Nozzle pertama / berikutnya</dt><dd>{{ settings.nozzle_temperature_initial_layer[0] }} / {{ settings.nozzle_temperature[0] }} °C</dd>
        <dt>Bed</dt><dd>{{ settings.textured_plate_temp[0] }} °C</dd>
      </dl>
    </template>
    <InfoTooltip v-else label="Informasi ekspor tanpa profil">3MF membawa model, warna, susunan plate, dan referensi printer. Pilih pengaturan proses dan filament di OrcaSlicer.</InfoTooltip>
  </section>
</template>
