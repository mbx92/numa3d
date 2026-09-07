<script setup>
import { CursorArrowRaysIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/vue/24/outline'
import { CLICKER_DEFAULTS } from '~/utils/clickerPresets.js'
import { getSwitchPreset } from '~/utils/clickerPresets.js'
import ToolColorBar from '~/components/ToolColorBar.vue'

const WizardLeadIcon = markRaw(CursorArrowRaysIcon)

const emit = defineEmits(['complete'])

const toast = useToast()

const steps = ['Desain', 'Warna', 'Mekanisme', 'Ukuran']
const step = ref(0)

const draft = reactive({
  label: CLICKER_DEFAULTS.label,
  shapeMode: CLICKER_DEFAULTS.shapeMode,
  baseShape: CLICKER_DEFAULTS.baseShape,
  perLetterShapes: CLICKER_DEFAULTS.perLetterShapes,
  letterShapes: [...(CLICKER_DEFAULTS.letterShapes || [])],
  flexiEnabled: CLICKER_DEFAULTS.flexiEnabled,
  flexiConnectionStyle: CLICKER_DEFAULTS.flexiConnectionStyle,
  flexiClearanceMm: CLICKER_DEFAULTS.flexiClearanceMm,
  flexiStrapHoleMm: CLICKER_DEFAULTS.flexiStrapHoleMm,
  text: CLICKER_DEFAULTS.text,
  fontUrl: CLICKER_DEFAULTS.fontUrl,
  svgContent: '',
  meshBuffer: CLICKER_DEFAULTS.meshBuffer,
  meshFilename: CLICKER_DEFAULTS.meshFilename,
  meshLibraryFileId: CLICKER_DEFAULTS.meshLibraryFileId,
  meshReliefHeightMm: CLICKER_DEFAULTS.meshReliefHeightMm,
  maxSizeMm: CLICKER_DEFAULTS.maxSizeMm,
  displayMode: CLICKER_DEFAULTS.displayMode,
  snapFitEnabled: CLICKER_DEFAULTS.snapFitEnabled,
  keyringEnabled: CLICKER_DEFAULTS.keyringEnabled,
  keyringStyle: CLICKER_DEFAULTS.keyringStyle,
  keyringHoleMm: CLICKER_DEFAULTS.keyringHoleMm,
  keyringAngleDeg: CLICKER_DEFAULTS.keyringAngleDeg,
  switchPresetId: CLICKER_DEFAULTS.switchPresetId,
  switchPreviewModelId: CLICKER_DEFAULTS.switchPreviewModelId,
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
  { key: 'base', label: 'Base', short: 'Base', hint: 'Casing & pocket switch', materialType: 'filament' },
  { key: 'lid', label: 'Lid', short: 'Lid', hint: 'Bagian tekan di atas switch', materialType: 'filament' },
  { key: 'text', label: 'Text / artwork', short: 'Text', hint: 'Tulisan atau logo pada lid', materialType: 'filament' }
]

const { mode: colorMode } = useToolColorMode()
const colorMaterialIds = ref({})

const pocketPreview = computed(() => {
  const p = activePreset.value
  const tol = Number(draft.fitToleranceMm) || 0.15
  return {
    housing: (p.housingOuterMm + tol * 2).toFixed(2),
    plate: (p.plateCutoutMm + tol * 2).toFixed(2),
    depth: (p.bodyDepthMm + tol).toFixed(2)
  }
})

function showError(message) {
  toast.error(message)
}

function validateStep() {
  if (step.value === 0) {
    if (!String(draft.label || '').trim()) {
      showError('Label wajib diisi')
      return false
    }
    if (draft.shapeMode === 'text' && !String(draft.text || '').trim()) {
      showError('Isi teks untuk lid')
      return false
    }
    if (draft.shapeMode === 'text' && !String(draft.fontUrl || '').trim()) {
      showError('Pilih font untuk teks lid')
      return false
    }
    if (draft.shapeMode === 'svg' && !String(draft.svgContent || '').trim()) {
      showError('Unggah SVG untuk lid')
      return false
    }
    if (draft.shapeMode === 'mesh' && !draft.meshBuffer) {
      showError('Pilih atau upload mesh .3mf untuk lid')
      return false
    }
  }
  if (step.value === 2) {
    if (draft.fitToleranceMm < 0 || draft.fitToleranceMm > 0.5) {
      showError('Toleransi 0–0.5 mm')
      return false
    }
  }
  if (step.value === 3 && draft.shapeMode === 'rect') {
    if (draft.outerWidthMm < 24 || draft.outerDepthMm < 24) {
      showError('Ukuran base minimal 24 × 24 mm')
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
  if (step.value > 0) step.value -= 1
}

function submit() {
  if (!validateStep()) return
  emit('complete', {
    label: String(draft.label).trim(),
    shapeMode: draft.shapeMode,
    baseShape: draft.baseShape,
    perLetterShapes: !!draft.perLetterShapes,
    letterShapes: Array.isArray(draft.letterShapes) ? [...draft.letterShapes] : [],
    flexiEnabled: !!draft.flexiEnabled,
    flexiConnectionStyle: draft.flexiConnectionStyle,
    flexiClearanceMm: Number(draft.flexiClearanceMm),
    flexiStrapHoleMm: Number(draft.flexiStrapHoleMm),
    text: String(draft.text || '').trim(),
    fontUrl: draft.fontUrl,
    svgContent: String(draft.svgContent || ''),
    meshBuffer: draft.meshBuffer,
    meshFilename: String(draft.meshFilename || ''),
    meshLibraryFileId: draft.meshLibraryFileId,
    meshReliefHeightMm: Number(draft.meshReliefHeightMm),
    maxSizeMm: Number(draft.maxSizeMm),
    displayMode: draft.displayMode,
    snapFitEnabled: !!draft.snapFitEnabled,
    keyringEnabled: !!draft.keyringEnabled,
    keyringStyle: draft.keyringStyle,
    keyringHoleMm: Number(draft.keyringHoleMm),
    keyringAngleDeg: Number(draft.keyringAngleDeg),
    switchPresetId: draft.switchPresetId,
    switchPreviewModelId: draft.switchPreviewModelId,
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
    <div
      class="panel shadow-xl overflow-hidden flex flex-col w-[min(100%,32rem)] h-[min(92vh,42rem)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clicker-wizard-title"
    >
      <header class="shrink-0 px-5 pt-5 pb-3 border-b border-ink-100">
        <div class="flex items-center gap-2.5">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-panel bg-accent-500/10 text-accent-600">
            <component :is="WizardLeadIcon" class="w-5 h-5" />
          </span>
          <div>
            <h2 id="clicker-wizard-title" class="text-base font-bold text-ink-900">Clicker Generator</h2>
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

      <div class="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-5 py-4 space-y-4">
        <template v-if="step === 0">
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Label / nama file</span>
            <input v-model="draft.label" class="input text-sm" maxlength="32" placeholder="Contoh: Logo Clicker" autofocus />
          </label>
          <ClickerDesignPicker
            v-model:shape-mode="draft.shapeMode"
            v-model:base-shape="draft.baseShape"
            v-model:per-letter-shapes="draft.perLetterShapes"
            v-model:letter-shapes="draft.letterShapes"
            v-model:flexi-enabled="draft.flexiEnabled"
            v-model:flexi-connection-style="draft.flexiConnectionStyle"
            v-model:flexi-clearance-mm="draft.flexiClearanceMm"
            v-model:flexi-strap-hole-mm="draft.flexiStrapHoleMm"
            v-model:text="draft.text"
            v-model:font-url="draft.fontUrl"
            v-model:svg-content="draft.svgContent"
            v-model:mesh-buffer="draft.meshBuffer"
            v-model:mesh-filename="draft.meshFilename"
            v-model:mesh-library-file-id="draft.meshLibraryFileId"
            v-model:mesh-relief-height-mm="draft.meshReliefHeightMm"
            v-model:max-size-mm="draft.maxSizeMm"
            v-model:display-mode="draft.displayMode"
            v-model:snap-fit-enabled="draft.snapFitEnabled"
            v-model:keyring-enabled="draft.keyringEnabled"
            v-model:keyring-style="draft.keyringStyle"
            v-model:keyring-hole-mm="draft.keyringHoleMm"
            v-model:keyring-angle-deg="draft.keyringAngleDeg"
          />
        </template>

        <template v-else-if="step === 1">
          <p class="text-xs text-ink-500">2 warna — base + lid terpisah (cocok AMS/multi-material).</p>
          <ToolColorBar
            v-model:mode="colorMode"
            v-model:colors="draft.colors"
            v-model:material-ids="colorMaterialIds"
            :fields="wizardColors"
            variant="list"
          />
        </template>

        <template v-else-if="step === 2">
          <ClickerSwitchPicker
            v-model="draft.switchPresetId"
            v-model:switch-preview-model-id="draft.switchPreviewModelId"
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
      </div>

      <footer class="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-t border-ink-100 bg-ink-50/50">
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
