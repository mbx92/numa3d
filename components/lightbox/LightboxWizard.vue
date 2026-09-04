<script setup>
import { LightBulbIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/vue/24/outline'
import { LIGHTBOX_DEFAULTS, CABLE_HOLE_SIDES } from '~/utils/lightboxPresets.js'
import ToolColorBar from '~/components/ToolColorBar.vue'

const emit = defineEmits(['complete'])

const toast = useToast()

const steps = ['Desain', 'Warna', 'Cahaya & stand', 'Ukuran']
const step = ref(0)

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
  diffuserEnabled: LIGHTBOX_DEFAULTS.diffuserEnabled,
  diffuserDepthMm: LIGHTBOX_DEFAULTS.diffuserDepthMm,
  diffuserColor: LIGHTBOX_DEFAULTS.diffuserColor,
  ledStripEnabled: LIGHTBOX_DEFAULTS.ledStripEnabled,
  ledStripWidthMm: LIGHTBOX_DEFAULTS.ledStripWidthMm,
  ledStripColor: LIGHTBOX_DEFAULTS.ledStripColor,
  ledLightColor: LIGHTBOX_DEFAULTS.ledLightColor,
  standEnabled: LIGHTBOX_DEFAULTS.standEnabled,
  standModelId: LIGHTBOX_DEFAULTS.standModelId,
  standWidthMm: LIGHTBOX_DEFAULTS.standWidthMm,
  standDepthMm: LIGHTBOX_DEFAULTS.standDepthMm,
  standBaseHeightMm: LIGHTBOX_DEFAULTS.standBaseHeightMm,
  standRailHeightMm: LIGHTBOX_DEFAULTS.standRailHeightMm,
  standSlotMm: LIGHTBOX_DEFAULTS.standSlotMm,
  standColor: LIGHTBOX_DEFAULTS.standColor,
  cableHoleMm: LIGHTBOX_DEFAULTS.cableHoleMm,
  cableHoleSide: LIGHTBOX_DEFAULTS.cableHoleSide,
  hangingHoleMm: LIGHTBOX_DEFAULTS.hangingHoleMm,
  hangingHoleOffsetMm: LIGHTBOX_DEFAULTS.hangingHoleOffsetMm,
  colors: { ...LIGHTBOX_DEFAULTS.colors }
})

const wizardColors = computed(() => {
  const type = 'filament'
  if (draft.designMode === 'text' || draft.designMode === 'svg' || draft.designMode === 'svg-qr') {
    return [
      { key: 'background', label: 'Latar', hint: 'Layer belakang face (translucent)', materialType: type },
      { key: 'text', label: 'Teks / Logo', hint: 'Warna utama desain', materialType: type },
      { key: 'frame', label: 'Frame', hint: 'Dinding samping', materialType: type },
      { key: 'back', label: 'Back', hint: 'Panel belakang + lubang kabel', materialType: type }
    ]
  }
  return [
    { key: 'frame', label: 'Frame', hint: 'Dinding samping', materialType: type },
    { key: 'back', label: 'Back', hint: 'Panel belakang + lubang kabel', materialType: type }
  ]
})

const { mode: colorMode } = useToolColorMode()
const colorMaterialIds = ref({})

const cableSides = CABLE_HOLE_SIDES

function showError(message) {
  toast.error(message)
}

function validateStep() {
  if (step.value === 0) {
    if (!String(draft.label || '').trim()) {
      showError('Label wajib diisi')
      return false
    }
    if (draft.designMode === 'text' && !String(draft.text || '').trim()) {
      showError('Isi teks')
      return false
    }
    if ((draft.designMode === 'svg' || draft.designMode === 'svg-qr') && !String(draft.svgContent || '').trim()) {
      showError(draft.designMode === 'svg-qr' ? 'Unggah SVG QR' : 'Unggah SVG')
      return false
    }
    if (draft.designMode === 'image' && !String(draft.imageDataUrl || '').trim()) {
      showError('Unggah gambar')
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
    diffuserEnabled: !!draft.diffuserEnabled,
    diffuserDepthMm: Number(draft.diffuserDepthMm),
    diffuserColor: draft.diffuserColor,
    ledStripEnabled: !!draft.ledStripEnabled,
    ledStripWidthMm: Number(draft.ledStripWidthMm),
    ledStripColor: draft.ledStripColor,
    ledLightColor: draft.ledLightColor,
    standEnabled: !!draft.standEnabled,
    standModelId: draft.standModelId,
    standWidthMm: Number(draft.standWidthMm),
    standDepthMm: Number(draft.standDepthMm),
    standBaseHeightMm: Number(draft.standBaseHeightMm),
    standRailHeightMm: Number(draft.standRailHeightMm),
    standSlotMm: Number(draft.standSlotMm),
    standColor: draft.standColor,
    cableHoleMm: Number(draft.cableHoleMm),
    cableHoleSide: draft.cableHoleSide,
    hangingHoleMm: Number(draft.hangingHoleMm),
    hangingHoleOffsetMm: Number(draft.hangingHoleOffsetMm),
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
      aria-labelledby="lightbox-wizard-title"
    >
      <header class="shrink-0 px-5 pt-5 pb-3 border-b border-ink-100">
        <div class="flex items-center gap-2.5">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-panel bg-accent-500/10 text-accent-600">
            <LightBulbIcon class="w-5 h-5" />
          </span>
          <div>
            <h2 id="lightbox-wizard-title" class="text-base font-bold text-ink-900">Lightbox Generator</h2>
            <p class="text-xs text-ink-500">Langkah {{ step + 1 }} dari {{ steps.length }} - {{ steps[step] }}</p>
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
            v-model:border-mm="draft.borderMm"
          />
        </template>

        <template v-else-if="step === 1">
          <p class="text-xs text-ink-500">
            {{
              draft.designMode === 'image'
                ? 'Warna face otomatis dari gambar. Atur frame & back di bawah.'
                : 'Warna layer face + frame - cocok untuk AMS/multi-material.'
            }}
          </p>
          <ToolColorBar
            v-model:mode="colorMode"
            v-model:colors="draft.colors"
            v-model:material-ids="colorMaterialIds"
            :fields="wizardColors"
            variant="list"
          />
        </template>

        <template v-else-if="step === 2">
          <p class="text-xs text-ink-500">Atur cahaya, tebal muka, rongga LED, dan stand.</p>

          <section class="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-xs font-semibold text-ink-800">Strip LED</p>
                <p class="text-[10px] text-ink-400">Hanya tampilan di layar, tidak ikut dicetak</p>
              </div>
              <input v-model="draft.ledStripEnabled" type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-accent-600" />
            </div>
            <div v-if="draft.ledStripEnabled" class="grid grid-cols-[1fr_auto_auto] items-end gap-2 border-t border-ink-50 pt-2">
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Lebar (mm)</span>
                <input v-model.number="draft.ledStripWidthMm" type="number" min="2" max="8" step="0.5" class="input-num w-full text-sm" />
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Warna papan</span>
                <input v-model="draft.ledStripColor" type="color" class="h-9 w-10 rounded-md border border-ink-200 cursor-pointer" />
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Warna lampu</span>
                <input v-model="draft.ledLightColor" type="color" class="h-9 w-10 rounded-md border border-ink-200 cursor-pointer" />
              </label>
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-xs font-semibold text-ink-800">Diffuser</p>
                <p class="text-[10px] text-ink-400">Lapisan tipis agar cahaya lebih rata</p>
              </div>
              <input v-model="draft.diffuserEnabled" type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-accent-600" />
            </div>
            <div v-if="draft.diffuserEnabled" class="grid grid-cols-[1fr_auto] items-end gap-2 border-t border-ink-50 pt-2">
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Tebal (mm)</span>
                <input v-model.number="draft.diffuserDepthMm" type="number" min="0.2" max="2" step="0.1" class="input-num w-full text-sm" />
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Warna</span>
                <input v-model="draft.diffuserColor" type="color" class="h-9 w-10 rounded-md border border-ink-200 cursor-pointer" />
              </label>
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
            <div>
              <p class="text-xs font-semibold text-ink-800">Tebal muka</p>
              <p class="text-[10px] text-ink-400">Latar dan tinggi timbul teks/gambar/QR</p>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Latar (mm)</span>
                <input v-model.number="draft.backLayerDepthMm" type="number" min="0.4" max="3" step="0.1" class="input-num w-full text-sm" />
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Desain timbul (mm)</span>
                <input v-model.number="draft.colorLayerDepthMm" type="number" min="0.3" max="1.5" step="0.1" class="input-num w-full text-sm" />
              </label>
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
            <div>
              <p class="text-xs font-semibold text-ink-800">Rongga dan belakang</p>
              <p class="text-[10px] text-ink-400">Ruang dalam untuk LED dan kabel</p>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Dalam rongga (mm)</span>
                <input v-model.number="draft.backCavityDepthMm" type="number" min="8" max="30" step="1" class="input-num w-full text-sm" />
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Panel belakang (mm)</span>
                <input v-model.number="draft.backPanelMm" type="number" min="1" max="6" step="0.5" class="input-num w-full text-sm" />
              </label>
            </div>
            <div class="grid grid-cols-2 gap-2 border-t border-ink-50 pt-2">
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Lubang kabel (mm)</span>
                <input v-model.number="draft.cableHoleMm" type="number" min="0" max="12" step="0.5" class="input-num w-full text-sm" />
                <span class="text-[10px] text-ink-400">Isi 0 jika tidak perlu</span>
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Posisi lubang</span>
                <select v-model="draft.cableHoleSide" class="input text-sm">
                  <option v-for="s in cableSides" :key="s.id" :value="s.id">{{ s.label }}</option>
                </select>
              </label>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Lubang gantung (mm)</span>
                <input v-model.number="draft.hangingHoleMm" type="number" min="0" max="12" step="0.5" class="input-num w-full text-sm" />
                <span class="text-[10px] text-ink-400">Isi 0 jika tidak perlu</span>
              </label>
              <label class="block space-y-1">
                <span class="text-[11px] font-medium text-ink-600">Jarak dari atas (mm)</span>
                <input v-model.number="draft.hangingHoleOffsetMm" type="number" min="4" max="30" step="0.5" class="input-num w-full text-sm" />
              </label>
            </div>
          </section>

          <section class="space-y-2 rounded-xl border border-ink-100 bg-white p-3">
            <div>
              <p class="text-xs font-semibold text-ink-800">Stand</p>
              <p class="text-[10px] text-ink-400">Boleh dilewati</p>
            </div>
            <LightboxStandPicker
              v-model:stand-model-id="draft.standModelId"
              v-model:stand-enabled="draft.standEnabled"
              v-model:stand-width-mm="draft.standWidthMm"
              v-model:stand-depth-mm="draft.standDepthMm"
              v-model:stand-base-height-mm="draft.standBaseHeightMm"
              v-model:stand-rail-height-mm="draft.standRailHeightMm"
              v-model:stand-slot-mm="draft.standSlotMm"
              v-model:stand-color="draft.standColor"
            />
          </section>
        </template>

        <template v-else>
          <p class="text-xs text-ink-500">
            {{
              draft.designMode === 'svg-qr'
                ? 'Mode QR: frame kotak rapi, gap 2 mm, ruang stand di bawah agar QR tetap terbaca.'
                : 'Frame otomatis menyesuaikan desain + border. Override manual jika perlu.'
            }}
          </p>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Border desain</span>
              <input
                v-model.number="draft.borderMm"
                type="number"
                min="2"
                max="15"
                step="0.5"
                class="input-num w-full"
                :disabled="draft.designMode === 'svg-qr'"
              />
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
      </div>

      <footer class="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-t border-ink-100 bg-ink-50/50">
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
