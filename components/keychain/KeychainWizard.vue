<script setup>
import { SparklesIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/vue/24/outline'
import { ATTACHMENT_TYPES, KEYCHAIN_DEFAULTS } from '~/utils/keychainGenerator.js'
import { KEYCHAIN_THEME_LIST, getKeychainTheme } from '~/utils/keychainThemes.js'
import { accentIndicesToLabel } from '~/utils/keychainAccent.js'
import ToolColorBar from '~/components/ToolColorBar.vue'

const emit = defineEmits(['complete'])

const toast = useToast()

const TEXT_PLACEHOLDER = 'Contoh: NAMA 07'

const steps = ['Teks', 'Warna', 'Font & kait', 'Ukuran']
const step = ref(0)

const initialTheme = getKeychainTheme(KEYCHAIN_DEFAULTS.themeId)
const accentIndices = ref([...(initialTheme.defaults.accentIndices || [])])
const draft = reactive({
  text: initialTheme.defaults.text || '',
  svgContent: '',
  svgSizeMm: 14,
  svgGapMm: 2,
  themeId: initialTheme.id,
  fontUrl: initialTheme.fontUrl,
  typographyId: initialTheme.typographyId || 'straight',
  attachmentType: initialTheme.defaults.attachmentType || 'hole',
  targetWidthMm: initialTheme.defaults.targetWidthMm ?? 68,
  targetHeightMm: initialTheme.defaults.targetHeightMm ?? 21,
  colors: {
    plate: initialTheme.colors.plate,
    letter: initialTheme.colors.letter,
    accent: initialTheme.colors.accent,
    base: initialTheme.colors.baseHighlight || initialTheme.colors.base
  }
})

const themes = KEYCHAIN_THEME_LIST
const attachmentTypes = ATTACHMENT_TYPES
const activeTheme = computed(() => getKeychainTheme(draft.themeId))

const wizardColors = [
  { key: 'plate', label: 'Plate teks', short: 'Plate', hint: 'Dasar di bawah huruf', materialType: 'filament' },
  { key: 'letter', label: 'Huruf', short: 'Huruf', hint: 'Karakter non-aksen', materialType: 'filament' },
  { key: 'accent', label: 'Aksen', short: 'Aksen', hint: 'Huruf aksen & logo SVG', isAccent: true, materialType: 'filament' },
  { key: 'base', label: 'Base', short: 'Base', hint: 'Body & cavity', materialType: 'filament' }
]

const { mode: colorMode } = useToolColorMode()
const colorMaterialIds = ref({})

const accentLabel = computed(() => accentIndicesToLabel(draft.text, accentIndices.value))

function showError(message) {
  toast.error(message)
}

function applyThemePreset(themeId) {
  const theme = getKeychainTheme(themeId)
  draft.themeId = theme.id
  draft.fontUrl = theme.fontUrl
  draft.typographyId = theme.typographyId || 'straight'
  draft.targetWidthMm = theme.defaults.targetWidthMm ?? draft.targetWidthMm
  draft.targetHeightMm = theme.defaults.targetHeightMm ?? draft.targetHeightMm
  draft.attachmentType = theme.defaults.attachmentType ?? draft.attachmentType
  draft.colors.plate = theme.colors.plate
  draft.colors.letter = theme.colors.letter
  draft.colors.accent = theme.colors.accent
  draft.colors.base = theme.colors.baseHighlight || theme.colors.base
}

function validateStep() {
  if (step.value === 0) {
    if (!String(draft.text || '').trim() && !String(draft.svgContent || '').trim()) {
      showError('Isi teks atau unggah logo SVG')
      return false
    }
  }
  if (step.value === 2) {
    if (String(draft.text || '').trim() && !String(draft.fontUrl || '').trim()) {
      showError('Pilih font untuk keychain berisi teks')
      return false
    }
  }
  if (step.value === 3) {
    if (draft.targetWidthMm < 20 || draft.targetHeightMm < 10) {
      showError('Ukuran minimal 20 × 10 mm')
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
  const theme = getKeychainTheme(draft.themeId)
  emit('complete', {
    text: String(draft.text).trim(),
    svgContent: String(draft.svgContent || ''),
    svgSizeMm: Number(draft.svgSizeMm) || 14,
    svgGapMm: Number(draft.svgGapMm) || 2,
    accentIndices: [...accentIndices.value],
    themeId: draft.themeId,
    fontUrl: draft.fontUrl,
    typographyId: draft.typographyId,
    attachmentType: draft.attachmentType,
    targetWidthMm: Number(draft.targetWidthMm),
    targetHeightMm: Number(draft.targetHeightMm),
    colors: {
      ...theme.colors,
      plate: draft.colors.plate,
      letter: draft.colors.letter,
      accent: draft.colors.accent,
      base: draft.colors.base,
      baseHighlight: draft.colors.base,
      baseBottom: draft.colors.base,
      cavityWall: draft.colors.base
    }
  })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-sm p-4">
    <div
      class="panel shadow-xl overflow-hidden flex flex-col w-[min(100%,32rem)] h-[min(92vh,42rem)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keychain-wizard-title"
    >
      <header class="shrink-0 px-5 pt-5 pb-3 border-b border-ink-100">
        <div class="flex items-center gap-2.5">
          <span class="inline-flex items-center justify-center w-9 h-9 rounded-panel bg-accent-500/10 text-accent-600">
            <SparklesIcon class="w-5 h-5" />
          </span>
          <div>
            <h2 id="keychain-wizard-title" class="text-base font-bold text-ink-900">Setup Keychain</h2>
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
        <!-- Step 1: Teks -->
        <template v-if="step === 0">
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Teks keychain</span>
            <input
              v-model="draft.text"
              class="input text-lg font-semibold tracking-wide"
              maxlength="40"
              :placeholder="TEXT_PLACEHOLDER"
              autofocus
            />
            <p class="text-[10px] text-ink-400">Opsional jika hanya pakai logo SVG.</p>
          </label>

          <KeychainSvgUpload
            v-model:svg-content="draft.svgContent"
            v-model:svg-size-mm="draft.svgSizeMm"
            v-model:svg-gap-mm="draft.svgGapMm"
          />

          <KeychainAccentPicker
            v-if="draft.text"
            v-model:accent-indices="accentIndices"
            :text="draft.text"
            :letter-color="draft.colors.letter"
            :accent-color="draft.colors.accent"
          />
        </template>

        <!-- Step 2: Warna (4) -->
        <template v-else-if="step === 1">
          <p class="text-xs text-ink-500">Material dari stok, atau 1 warna abu-abu dulu.</p>
          <p v-if="accentLabel" class="text-[11px] text-ink-500">
            Huruf aksen: <strong>{{ accentLabel }}</strong>
          </p>
          <p v-else class="text-[11px] text-ink-400">Belum ada huruf aksen — kembali ke langkah Teks untuk memilih.</p>
          <ToolColorBar
            v-model:mode="colorMode"
            v-model:colors="draft.colors"
            v-model:material-ids="colorMaterialIds"
            :fields="wizardColors"
            variant="list"
          />
        </template>

        <!-- Step 3: Font & attachment -->
        <template v-else-if="step === 2">
          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Theme preset</span>
            <select v-model="draft.themeId" class="input text-sm" @change="applyThemePreset(draft.themeId)">
              <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <p class="text-[11px] text-ink-400">{{ activeTheme.description }}</p>
          </label>

          <KeychainFontPicker v-model="draft.fontUrl" :preview-text="draft.text || 'NUMA 3D'" />

          <KeychainTypographyPicker v-model="draft.typographyId" />

          <label class="block space-y-1.5">
            <span class="text-xs font-medium text-ink-700">Tipe attachment</span>
            <select v-model="draft.attachmentType" class="input text-sm">
              <option v-for="t in attachmentTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
            <p class="text-[11px] text-ink-400">
              {{ attachmentTypes.find((t) => t.id === draft.attachmentType)?.description }}
            </p>
          </label>
        </template>

        <!-- Step 4: Ukuran -->
        <template v-else>
          <p class="text-xs text-ink-500">Ukuran area teks (mm) — base menyesuaikan otomatis.</p>
          <div class="grid grid-cols-2 gap-3">
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Lebar teks</span>
              <div class="relative">
                <input v-model.number="draft.targetWidthMm" type="number" min="20" max="120" step="0.5" class="input-num w-full pr-10" />
                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">mm</span>
              </div>
            </label>
            <label class="block space-y-1.5">
              <span class="text-xs font-medium text-ink-700">Tinggi tag</span>
              <div class="relative">
                <input v-model.number="draft.targetHeightMm" type="number" min="10" max="40" step="0.5" class="input-num w-full pr-10" />
                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">mm</span>
              </div>
            </label>
          </div>
          <div class="rounded-lg bg-ink-50 border border-ink-100 px-3 py-2 text-center">
            <span class="text-2xl font-mono font-bold text-ink-800">{{ draft.targetWidthMm }} × {{ draft.targetHeightMm }}</span>
            <span class="text-xs text-ink-400 ml-1">mm</span>
          </div>
        </template>
      </div>

      <footer class="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-t border-ink-100 bg-ink-50/50">
        <button type="button" class="btn-secondary text-sm" :disabled="step === 0" @click="back">
          <ChevronLeftIcon class="w-4 h-4" />
          Kembali
        </button>
        <button type="button" class="btn-primary text-sm" @click="next">
          {{ step === steps.length - 1 ? 'Buat keychain' : 'Lanjut' }}
          <ChevronRightIcon v-if="step < steps.length - 1" class="w-4 h-4" />
        </button>
      </footer>
    </div>
  </div>
</template>
