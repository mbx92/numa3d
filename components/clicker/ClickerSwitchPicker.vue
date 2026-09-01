<script setup>
import { SWITCH_PRESET_LIST, getSwitchPreset } from '~/utils/clickerPresets.js'

const modelValue = defineModel({ type: String, default: 'cherry_mx' })

const presets = SWITCH_PRESET_LIST
const active = computed(() => getSwitchPreset(modelValue.value))
</script>

<template>
  <div class="space-y-2">
    <label class="block space-y-1.5">
      <span class="text-xs font-medium text-ink-700">Tipe switch</span>
      <select v-model="modelValue" class="input text-sm">
        <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>

    <div class="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2.5 space-y-2">
      <p class="text-[11px] text-ink-500 leading-relaxed">{{ active.description }}</p>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono text-ink-600">
        <div class="flex justify-between gap-2">
          <dt class="text-ink-400">Housing</dt>
          <dd>{{ active.housingOuterMm }} mm</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-ink-400">Kedalaman</dt>
          <dd>{{ active.bodyDepthMm }} mm</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-ink-400">Plate cutout</dt>
          <dd>{{ active.plateCutoutMm }} mm</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-ink-400">Stem boss</dt>
          <dd>{{ active.stemBossMm }} mm</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
