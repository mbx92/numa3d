<script setup>
import { SWITCH_PRESET_LIST, SWITCH_PREVIEW_MODELS, getSwitchPreset, getSwitchPreviewModel } from '~/utils/clickerPresets.js'

const modelValue = defineModel({ type: String, default: 'cherry_mx' })
const switchPreviewModelId = defineModel('switchPreviewModelId', { type: String, default: 'cherry_mx_glb' })
const stemFitPct = defineModel('stemFitPct', { type: Number, default: 0 })
const socketFitPct = defineModel('socketFitPct', { type: Number, default: 0 })
const slipToleranceMm = defineModel('slipToleranceMm', { type: Number, default: 0.4 })

const presets = SWITCH_PRESET_LIST
const previewModels = SWITCH_PREVIEW_MODELS
const active = computed(() => getSwitchPreset(modelValue.value))
const activePreviewModel = computed(() => getSwitchPreviewModel(switchPreviewModelId.value))
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

    <label class="block space-y-1.5">
      <span class="text-xs font-medium text-ink-700">Model switch di preview</span>
      <select v-model="switchPreviewModelId" class="input text-sm">
        <option v-for="model in previewModels" :key="model.id" :value="model.id">{{ model.name }}</option>
      </select>
      <p class="text-[10px] text-ink-400">{{ activePreviewModel.description }}</p>
      <p v-if="activePreviewModel.attribution" class="text-[10px] text-ink-400">{{ activePreviewModel.attribution }}</p>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Slip-fit lid ↔ well</span>
      <div class="flex items-center gap-2">
        <input v-model.number="slipToleranceMm" type="range" min="0.1" max="1" step="0.05" class="flex-1" />
        <span class="text-xs font-mono w-12 text-right">{{ slipToleranceMm }} mm</span>
      </div>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Socket fit (pocket)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="socketFitPct" type="range" min="-5" max="5" step="0.5" class="flex-1" />
        <span class="text-xs font-mono w-12 text-right">{{ socketFitPct }}%</span>
      </div>
      <p class="text-[10px] text-ink-400">+ = pocket lebih longgar, − = lebih ketat.</p>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Stem fit (lid)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="stemFitPct" type="range" min="-5" max="5" step="0.5" class="flex-1" />
        <span class="text-xs font-mono w-12 text-right">{{ stemFitPct }}%</span>
      </div>
      <p class="text-[10px] text-ink-400">+ = stem socket lebih longgar di switch.</p>
    </label>
  </div>
</template>
