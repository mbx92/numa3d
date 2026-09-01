<script setup>
import { LightBulbIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/vue/24/outline'
import { LIGHTBOX_DEFAULTS, CABLE_HOLE_SIDES } from '~/utils/lightboxPresets.js'

const emit = defineEmits(['complete'])

const steps = ['Desain', 'Warna', 'LED & Frame', 'Ukuran']
const step = ref(0)
const error = ref('')

const draft = reactive({
  label: LIGHTBOX_DEFAULTS.label,
  designMode: LIGHTBOX_DEFAULTS.designMode,
  text: LIGHTBOX_DEFAULTS.text,
  fontUrl: LIGHTBOX_DEFAULTS.fontUrl,
  svgContent: '',
  imageDataUrl: '',
  maxSizeMm: LIGHTBOX_DEFAULTS.maxSizeMm,
  maxColors: LIGHTBOX_DEFAULTS.maxColors,
  outerWidthMm: LIGHTBOX_DEFAULTS.outerWidthMm,
  outerDepthMm: LIGHTBOX_DEFAULTS.outerDepthMm,
  borderMm: LIGHTBOX_DEFAULTS.borderMm,
  cornerRadiusMm: LIGHTBOX_DEFAULTS.cornerRadiusMm,
  backLayerDepthMm: LIGHTBOX_DEFAULTS.backLayerDepthMm,
  colorLayerDepthMm: LIGHTBOX_DEFAULTS.colorLayerDepthMm,
  backPanelMm: LIGHTBOX_DEFAULTS.backPanelMm,
  backCavityDepthMm: LIGHTBOX_DEFAULTS.backCavityDepthMm,
  wallThicknessMm: LIGHTBOX_DEFAULTS.wallThicknessMm,
  cableHoleMm: LIGHTBOX_DEFAULTS.cableHoleMm,
  cableHoleSide: LIGHTBOX_DEFAULTS.cableHoleSide,
  colors: { ...LIGHTBOX_DEFAULTS.colors }
})

const wizardColors = computed(() => {
  if (draft.designMode === 'text' || draft.designMode === 'svg') {
    return [
      { key: 'background', label: 'Latar', hint: 'Layer belakang face (translucent)' },
      { key: 'text', label: 'Teks / Logo', hint: 'Warna utama desain' },
      { key: 'frame', label: 'Frame', hint: 'Dinding samping' },
      { key: 'back', label: 'Back', hint: 'Panel belakang + lubang kabel' }
    ]
  }
  return [
    { key: 'frame', label: 'Frame', hint: 'Dinding samping' },
    { key: 'back', label: 'Back', hint: 'Panel belakang + lubang kabel' }
  ]
})

const cableSides = CABLE_HOLE_SIDES

function validateStep() {
  error.value = ''
  if (step.value === 0) {
    if (!String(draft.label || '').trim()) {
      error.value = 'Label wajib diisi'
      return false
    }
    if (draft.designMode === 'text' && !String(draft.text || '').trim()) {
      error.value = 'Isi teks'
      return false
    }
    if (draft.designMode === 'svg' && !String(draft.svgContent || '').trim()) {
      error.value = 'Unggah SVG'
      return false
    }
    if (draft.designMode === 'image' && !String(draft.imageDataUrl || '').trim()) {
      error.value = 'Unggah gambar'
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
    designMode: draft.designMode,
    text: String(draft.text || '').trim(),
    fontUrl: draft.fontUrl,
    svgContent: String(draft.svgContent || ''),
    imageDataUrl: String(draft.imageDataUrl || ''),
    maxSizeMm: Number(draft.maxSizeMm),
    maxColors: Number(draft.maxColors),
    outerWidthMm: Number(draft.outerWidthMm),
    outerDepthMm: Number(draft.outerDepthMm),
    borderMm: Number(draft.borderMm),
    cornerRadiusMm: Number(draft.cornerRadiusMm),
    backLayerDepthMm: Number(draft.backLayerDepthMm),
    colorLayerDepthMm: Number(draft.colorLayerDepthMm),
    backPanelMm: Number(draft.backPanelMm),
    backCavityDepthMm: Number(draft.backCavityDepthMm),
    wallThicknessMm: Number(draft.wallThicknessMm),
    cableHoleMm: Number(draft.cableHoleMm),
    cableHoleSide: draft.cableHoleSide,
    colors: { ...draft.colors }
  })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-sm p-4">
    <div class="w-full max-w-lg panel shadow-xl overflow-hidden">
      <header class="px-5 pt-5 pb-3 border-b border-ink-100">
        <div class="flex items-center gap-2.5">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-panel bg-amber-500/10 text-amber-600">
            <LightBulbIcon class="w-5 h-5" />
          </span>
          <div>
            <h2 class="text-base font-bold text-ink-900">Lightbox Generator</h2>
            <p class="text-xs text-ink-500">Langkah {{ step + 1 }} dari {{ steps.length }} · {{ steps[step] }}</p>
          </div>
        </div>
        <div class="flex gap-1.5 mt-4">
          <span
            v-for="(label, i) in steps"
            :key="label"
            class="h-1 flex-1 rounded-full transition-colors"
            :class="i <= step ? 'bg-amber-500' : 'bg-ink-200'"
          />
        </div>
      </header>

      <div class="px-5 py-4 space-y-4 min-h-[18rem] max-h-[min(70vh,36rem)] overflow-y-auto">
        <template v-if="step === 0">
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Label / nama file</span>
            <input v-model="draft.label" class="input text-sm" maxlength="32" placeholder="Contoh: Logo Lightbox" autofocus />
          </label>
          <LightboxDesignPicker
            v-model:design-mode="draft.designMode"
            v-model:text="draft.text"
            v-model:font-url="draft.fontUrl"
            v-model:svg-content="draft.svgContent"
            v-model:image-data-url="draft.imageDataUrl"
            v-model:max-size-mm="draft.maxSizeMm"
            v-model:max-colors="draft.maxColors"
          />
        </template>

        <template v-else-if="step === 1">
          <p class="text-xs text-ink-500">
            {{
              draft.designMode === 'image'
                ? 'Warna face otomatis dari gambar. Atur frame & back di bawah.'
                : 'Warna layer face + frame — cocok AMS/multi-material.'
            }}
          </p>
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
          <p class="text-xs text-ink-500">Back lebih dalam dari front — ruang untuk LED strip & kabel (seperti MakerWorld).</p>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Kedalaman cavity LED</span>
              <input v-model.number="draft.backCavityDepthMm" type="number" min="8" max="30" step="1" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Tebal back panel</span>
              <input v-model.number="draft.backPanelMm" type="number" min="1" max="6" step="0.5" class="input-num w-full" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Lubang kabel (Ø mm)</span>
              <input v-model.number="draft.cableHoleMm" type="number" min="0" max="12" step="0.5" class="input-num w-full" />
              <span class="text-[10px] text-ink-400">0 = tanpa lubang</span>
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Posisi lubang</span>
              <select v-model="draft.cableHoleSide" class="input text-sm">
                <option v-for="s in cableSides" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Layer latar (mm)</span>
              <input v-model.number="draft.backLayerDepthMm" type="number" min="0.4" max="3" step="0.1" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Layer warna (mm)</span>
              <input v-model.number="draft.colorLayerDepthMm" type="number" min="0.3" max="1.5" step="0.1" class="input-num w-full" />
            </label>
          </div>
        </template>

        <template v-else>
          <p class="text-xs text-ink-500">Frame otomatis menyesuaikan desain + border. Override manual jika perlu.</p>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Border desain</span>
              <input v-model.number="draft.borderMm" type="number" min="2" max="15" step="0.5" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Radius sudut</span>
              <input v-model.number="draft.cornerRadiusMm" type="number" min="0" max="15" step="0.5" class="input-num w-full" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Lebar frame</span>
              <input v-model.number="draft.outerWidthMm" type="number" min="60" max="200" step="1" class="input-num w-full" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Kedalaman frame</span>
              <input v-model.number="draft.outerDepthMm" type="number" min="60" max="200" step="1" class="input-num w-full" />
            </label>
          </div>
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Tebal dinding</span>
            <input v-model.number="draft.wallThicknessMm" type="number" min="1.2" max="6" step="0.1" class="input-num w-full" />
          </label>
        </template>

        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      </div>

      <footer class="flex items-center justify-between gap-2 px-5 py-4 border-t border-ink-100 bg-ink-50/50">
        <button type="button" class="btn-secondary text-sm" :disabled="step === 0" @click="back">
          <ChevronLeftIcon class="w-4 h-4" />
          Kembali
        </button>
        <button type="button" class="btn-primary text-sm" @click="next">
          {{ step === steps.length - 1 ? 'Buat lightbox' : 'Lanjut' }}
          <ChevronRightIcon v-if="step < steps.length - 1" class="w-4 h-4" />
        </button>
      </footer>
    </div>
  </div>
</template>
