<script setup>
import { STAND_PRESETS, applyStandPreset, getStandPreset } from '~/utils/lightboxPresets.js'

const standModelId = defineModel('standModelId', { type: String, default: 'cradle' })
const standEnabled = defineModel('standEnabled', { type: Boolean, default: true })
const standWidthMm = defineModel('standWidthMm', { type: Number, default: 0 })
const standDepthMm = defineModel('standDepthMm', { type: Number, default: 34 })
const standBaseHeightMm = defineModel('standBaseHeightMm', { type: Number, default: 4 })
const standRailHeightMm = defineModel('standRailHeightMm', { type: Number, default: 8 })
const standSlotMm = defineModel('standSlotMm', { type: Number, default: 0 })
const standColor = defineModel('standColor', { type: String, default: '#20242c' })

const presets = STAND_PRESETS
const activePreset = computed(() => getStandPreset(standModelId.value))
const showDimensions = computed(() => standModelId.value !== 'none')

function selectPreset(id) {
  const applied = applyStandPreset(id, {
    standWidthMm: standWidthMm.value,
    standDepthMm: standDepthMm.value,
    standBaseHeightMm: standBaseHeightMm.value,
    standRailHeightMm: standRailHeightMm.value,
    standSlotMm: standSlotMm.value,
    standColor: standColor.value
  })
  standModelId.value = applied.standModelId
  standEnabled.value = applied.standEnabled
  if (id !== 'none') {
    standWidthMm.value = applied.standWidthMm
    standDepthMm.value = applied.standDepthMm
    standBaseHeightMm.value = applied.standBaseHeightMm
    standRailHeightMm.value = applied.standRailHeightMm
    standSlotMm.value = applied.standSlotMm
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <span class="text-xs font-medium text-ink-700">Model stand</span>
      <div class="grid grid-cols-4 gap-1 mt-1.5">
        <button
          v-for="p in presets"
          :key="p.id"
          type="button"
          class="flex flex-col items-center justify-center gap-0.5 rounded-md border p-1.5 transition-colors aspect-square"
          :class="
            standModelId === p.id
              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
              : 'border-ink-200 hover:border-ink-300 text-ink-600'
          "
          :title="`${p.label} — ${p.description}`"
          :aria-label="p.label"
          :aria-pressed="standModelId === p.id"
          @click="selectPreset(p.id)"
        >
          <LightboxStandIcon :model="p.id" class="w-5 h-5 shrink-0" />
          <span class="text-[9px] leading-none font-medium truncate w-full text-center">{{ p.label }}</span>
        </button>
      </div>
      <p class="text-[10px] text-ink-400 mt-1">{{ activePreset.description }}</p>
    </div>

    <template v-if="showDimensions">
      <div class="grid grid-cols-2 gap-2">
        <KeychainCompactField label="Lebar" unit="mm">
          <input v-model.number="standWidthMm" type="number" min="0" max="220" step="1" class="input-num w-full text-sm" />
        </KeychainCompactField>
        <KeychainCompactField label="Kedalaman" unit="mm">
          <input v-model.number="standDepthMm" type="number" min="14" max="70" step="1" class="input-num w-full text-sm" />
        </KeychainCompactField>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <KeychainCompactField label="Base" unit="mm">
          <input v-model.number="standBaseHeightMm" type="number" min="1.5" max="12" step="0.5" class="input-num w-full text-sm" />
        </KeychainCompactField>
        <KeychainCompactField v-if="standModelId !== 'wall'" label="Bibir" unit="mm">
          <input v-model.number="standRailHeightMm" type="number" min="2" max="20" step="0.5" class="input-num w-full text-sm" />
        </KeychainCompactField>
        <KeychainCompactField v-else label="Bracket" unit="mm">
          <input v-model.number="standBaseHeightMm" type="number" min="2" max="8" step="0.5" class="input-num w-full text-sm" />
        </KeychainCompactField>
      </div>
      <div class="grid grid-cols-[1fr_auto] gap-2">
        <KeychainCompactField label="Slot body" unit="mm">
          <input v-model.number="standSlotMm" type="number" min="0" max="50" step="0.5" class="input-num w-full text-sm" />
        </KeychainCompactField>
        <KeychainCompactField label="Warna">
          <input v-model="standColor" type="color" class="h-9 w-10 rounded-md border border-ink-200 cursor-pointer" />
        </KeychainCompactField>
      </div>
      <p class="text-[10px] text-ink-400">Lebar & slot 0 = otomatis menyesuaikan ukuran body lightbox.</p>
    </template>
  </div>
</template>
