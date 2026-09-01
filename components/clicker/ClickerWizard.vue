<script setup>
import { CursorArrowRaysIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/vue/24/outline'
import { CLICKER_DEFAULTS } from '~/utils/clickerPresets.js'
import { getSwitchPreset } from '~/utils/clickerPresets.js'

const emit = defineEmits(['complete'])

const steps = ['Desain', 'Warna', 'Mekanisme', 'Ukuran']
const step = ref(0)
const error = ref('')

const draft = reactive({
  label: CLICKER_DEFAULTS.label,
  shapeMode: CLICKER_DEFAULTS.shapeMode,
  baseShape: CLICKER_DEFAULTS.baseShape,
  text: CLICKER_DEFAULTS.text,
  fontUrl: CLICKER_DEFAULTS.fontUrl,
  svgContent: '',
  maxSizeMm: CLICKER_DEFAULTS.maxSizeMm,
  displayMode: CLICKER_DEFAULTS.displayMode,
  keyringEnabled: CLICKER_DEFAULTS.keyringEnabled,
  switchPresetId: CLICKER_DEFAULTS.switchPresetId,
  fitToleranceMm: CLICKER_DEFAULTS.fitToleranceMm,
  slipToleranceMm: CLICKER_DEFAULTS.slipToleranceMm,
  stemFitPct: CLICKER_DEFAULTS.stemFitPct,
  socketFitPct: CLICKER_DEFAULTS.socketFitPct,
  capProudMm: CLICKER_DEFAULTS.capProudMm,
  outerWidthMm: CLICKER_DEFAULTS.outerWidthMm,
  outerDepthMm: CLICKER_DEFAULTS.outerDepthMm,
  outerHeightMm: CLICKER_DEFAULTS.outerHeightMm,
  floorThicknessMm: CLICKER_DEFAULTS.floorThicknessMm,
  topRimMm: CLICKER_DEFAULTS.topRimMm,
  wallThicknessMm: CLICKER_DEFAULTS.wallThicknessMm,
  lidHeightMm: CLICKER_DEFAULTS.lidHeightMm,
  colors: { ...CLICKER_DEFAULTS.colors }
})

const activePreset = computed(() => getSwitchPreset(draft.switchPresetId))

const wizardColors = [
  { key: 'base', label: 'Base', hint: 'Casing & pocket switch' },
  { key: 'lid', label: 'Lid', hint: 'Bagian tekan di atas switch' }
]

const pocketPreview = computed(() => {
  const p = activePreset.value
  const tol = Number(draft.fitToleranceMm) || 0.15
  return {
    housing: (p.housingOuterMm + tol * 2).toFixed(2),
    plate: (p.plateCutoutMm + tol * 2).toFixed(2),
    depth: (p.bodyDepthMm + tol).toFixed(2)
  }
})

function validateStep() {
  error.value = ''
  if (step.value === 0) {
    if (!String(draft.label || '').trim()) {
      error.value = 'Label wajib diisi'
      return false
    }
    if (draft.shapeMode === 'text' && !String(draft.text || '').trim()) {
      error.value = 'Isi teks untuk lid'
      return false
    }
    if (draft.shapeMode === 'svg' && !String(draft.svgContent || '').trim()) {
      error.value = 'Unggah SVG untuk lid'
      return false
    }
  }
  if (step.value === 2) {
    if (draft.fitToleranceMm < 0 || draft.fitToleranceMm > 0.5) {
      error.value = 'Toleransi 0–0.5 mm'
      return false
    }
  }
  if (step.value === 3 && draft.shapeMode === 'rect') {
    if (draft.outerWidthMm < 24 || draft.outerDepthMm < 24) {
      error.value = 'Ukuran base minimal 24 × 24 mm'
      return false
    }
  }
  return true
}

function next() {
  if (!validateStep()) return
  if (step.value < steps.length - 1) step.value += 1
  else submit()
}

function back() {
  error.value = ''
  if (step.value > 0) step.value -= 1
}

function submit() {
  if (!validateStep()) return
  emit('complete', {
    label: String(draft.label).trim(),
    shapeMode: draft.shapeMode,
    baseShape: draft.baseShape,
    text: String(draft.text || '').trim(),
    fontUrl: draft.fontUrl,
    svgContent: String(draft.svgContent || ''),
    maxSizeMm: Number(draft.maxSizeMm),
    displayMode: draft.displayMode,
    keyringEnabled: !!draft.keyringEnabled,
    switchPresetId: draft.switchPresetId,
    fitToleranceMm: Number(draft.fitToleranceMm),
    slipToleranceMm: Number(draft.slipToleranceMm),
    stemFitPct: Number(draft.stemFitPct),
    socketFitPct: Number(draft.socketFitPct),
    capProudMm: Number(draft.capProudMm),
    outerWidthMm: Number(draft.outerWidthMm),
    outerDepthMm: Number(draft.outerDepthMm),
    outerHeightMm: Number(draft.outerHeightMm),
    floorThicknessMm: Number(draft.floorThicknessMm),
    topRimMm: Number(draft.topRimMm),
    wallThicknessMm: Number(draft.wallThicknessMm),
    lidHeightMm: Number(draft.lidHeightMm),
    colors: { ...draft.colors }
  })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-sm p-4">
    <div class="w-full max-w-lg panel shadow-xl overflow-hidden">
      <header class="px-5 pt-5 pb-3 border-b border-ink-100">
        <div class="flex items-center gap-2.5">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-panel bg-accent-500/10 text-accent-600">
            <CursorArrowRaysIcon class="w-5 h-5" />
          </span>
          <div>
            <h2 class="text-base font-bold text-ink-900">Clicker Generator</h2>
            <p class="text-xs text-ink-500">Langkah {{ step + 1 }} dari {{ steps.length }} · {{ steps[step] }}</p>
          </div>
        </div>
        <div class="flex gap-1.5 mt-4">
          <span
            v-for="(label, i) in steps"
            :key="label"
            class="h-1 flex-1 rounded-full transition-colors"
            :class="i <= step ? 'bg-accent-500' : 'bg-ink-200'"
          />
        </div>
      </header>

      <div class="px-5 py-4 space-y-4 min-h-[18rem] max-h-[min(70vh,36rem)] overflow-y-auto">
        <template v-if="step === 0">
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Label / nama file</span>
            <input v-model="draft.label" class="input text-sm" maxlength="32" placeholder="Contoh: Logo Clicker" autofocus />
          </label>
          <ClickerDesignPicker
            v-model:shape-mode="draft.shapeMode"
            v-model:base-shape="draft.baseShape"
            v-model:text="draft.text"
            v-model:font-url="draft.fontUrl"
            v-model:svg-content="draft.svgContent"
            v-model:max-size-mm="draft.maxSizeMm"
            v-model:display-mode="draft.displayMode"
            v-model:keyring-enabled="draft.keyringEnabled"
          />
        </template>

        <template v-else-if="step === 1">
          <p class="text-xs text-ink-500">2 warna — base + lid terpisah (cocok AMS/multi-material).</p>
          <div class="grid grid-cols-1 gap-3">
            <label
              v-for="c in wizardColors"
              :key="c.key"
              class="flex items-center gap-3 rounded-lg border border-ink-100 p-3 cursor-pointer hover:border-ink-200"
            >
              <input v-model="draft.colors[c.key]" type="color" class="h-10 w-10 shrink-0 rounded-md border border-ink-200 cursor-pointer" />
              <span class="min-w-0">
                <span class="block text-xs font-medium text-ink-800">{{ c.label }}</span>
                <span class="block text-[10px] text-ink-400">{{ c.hint }}</span>
              </span>
            </label>
          </div>
        </template>

        <template v-else-if="step === 2">
          <ClickerSwitchPicker
            v-model="draft.switchPresetId"
            v-model:stem-fit-pct="draft.stemFitPct"
            v-model:socket-fit-pct="draft.socketFitPct"
            v-model:slip-tolerance-mm="draft.slipToleranceMm"
          />
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Toleransi pocket (mm)</span>
            <div class="flex items-center gap-2">
              <input v-model.number="draft.fitToleranceMm" type="range" min="0" max="0.4" step="0.02" class="flex-1" />
              <span class="text-xs font-mono text-ink-700 w-14 text-right">{{ draft.fitToleranceMm }} mm</span>
            </div>
          </label>
          <div class="rounded-lg bg-accent-50/60 border border-accent-100 px-3 py-2 text-[11px] text-ink-600">
            Pocket: <strong>{{ pocketPreview.housing }} mm</strong> · kedalaman <strong>{{ pocketPreview.depth }} mm</strong>
          </div>
        </template>

        <template v-else>
          <p class="text-xs text-ink-500">
            {{ draft.shapeMode === 'rect' ? 'Ukuran base manual.' : 'Base menyesuaikan otomatis dari bentuk lid + padding.' }}
          </p>
          <div v-if="draft.shapeMode === 'rect'" class="grid grid-cols-3 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Lebar base</span>
              <input v-model.number="draft.outerWidthMm" type="number" min="24" max="80" step="0.5" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Kedalaman</span>
              <input v-model.number="draft.outerDepthMm" type="number" min="24" max="80" step="0.5" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Tinggi base</span>
              <input v-model.number="draft.outerHeightMm" type="number" min="12" max="50" step="0.5" class="input-num w-full" />
            </label>
          </div>
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Tinggi lid</span>
            <input v-model.number="draft.lidHeightMm" type="number" min="6" max="20" step="0.5" class="input-num w-full" />
          </label>
          <div class="grid grid-cols-3 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Lantai</span>
              <input v-model.number="draft.floorThicknessMm" type="number" min="1" max="6" step="0.1" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Rim atas</span>
              <input v-model.number="draft.topRimMm" type="number" min="1" max="8" step="0.1" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Dinding</span>
              <input v-model.number="draft.wallThicknessMm" type="number" min="1.5" max="8" step="0.1" class="input-num w-full" />
            </label>
          </div>
        </template>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </div>

      <footer class="flex items-center justify-between gap-2 px-5 py-4 border-t border-ink-100 bg-ink-50/50">
        <button type="button" class="btn-secondary text-sm" :disabled="step === 0" @click="back">
          <ChevronLeftIcon class="w-4 h-4" />
          Kembali
        </button>
        <button type="button" class="btn-primary text-sm" @click="next">
          {{ step === steps.length - 1 ? 'Buat clicker' : 'Lanjut' }}
          <ChevronRightIcon v-if="step < steps.length - 1" class="w-4 h-4" />
        </button>
      </footer>
    </div>
  </div>
</template>
