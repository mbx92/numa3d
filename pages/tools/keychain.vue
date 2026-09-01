<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'Keychain Generator',
  toolFullBleed: true
})

import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CloudArrowUpIcon,
  PencilSquareIcon,
  LinkIcon,
  Square3Stack3DIcon,
  ArrowsPointingInIcon,
  RectangleGroupIcon,
  PaintBrushIcon,
  DocumentArrowDownIcon,
  HashtagIcon
} from '@heroicons/vue/24/outline'
import {
  ATTACHMENT_TYPES,
  KEYCHAIN_DEFAULTS,
  generateKeychain,
  downloadBlob
} from '~/utils/keychainGenerator.js'
import { resolveInsertFit } from '~/utils/keychainCore.js'
import { EXPORT_FORMATS, exportFilename, exportMime } from '~/utils/keychainExport.js'
import { resolveEyeletLayout } from '~/utils/shapeClipper.js'
import { KEYCHAIN_THEME_LIST, getKeychainTheme } from '~/utils/keychainThemes.js'
import { accentIndicesToLabel } from '~/utils/keychainAccent.js'

const TEXT_PLACEHOLDER = 'Contoh: NAMA 07'

const TEXT_COLOR_FIELDS = [
  { key: 'plate', label: 'Plate', short: 'Plate' },
  { key: 'letter', label: 'Huruf', short: 'Huruf' },
  { key: 'accent', label: 'Aksen', short: 'Aksen', isAccent: true }
]

const BASE_COLOR_FIELDS = [
  { key: 'baseHighlight', label: 'Rim', short: 'Rim' },
  { key: 'baseBottom', label: 'Dasar', short: 'Dasar' },
  { key: 'cavityWall', label: 'Cavity', short: 'Cavity' }
]

const exportFormats = EXPORT_FORMATS
const initialTheme = getKeychainTheme(KEYCHAIN_DEFAULTS.themeId)
const form = reactive({
  ...KEYCHAIN_DEFAULTS,
  colors: { ...initialTheme.colors }
})
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()

const themes = KEYCHAIN_THEME_LIST
const attachmentTypes = ATTACHMENT_TYPES
const exportFormat = ref('3mf')
const activeAttachment = computed(
  () => attachmentTypes.find((t) => t.id === form.attachmentType) || attachmentTypes[0]
)

const insertFit = computed(() => resolveInsertFit(form))
const cavityDepthPreview = computed(() => insertFit.value.cavityDepth.toFixed(2))
const maxTextPreview = computed(() => insertFit.value.maxTextH.toFixed(2))
const eyeletLayout = computed(() =>
  form.attachmentType === 'hole' ? resolveEyeletLayout(form) : null
)

const textThicknessWarning = computed(() =>
  insertFit.value.textClamped ? `Akan dipotong ke maks. ${maxTextPreview.value} mm` : ''
)

const accentCharsLabel = computed(() => accentIndicesToLabel(form.text, form.accentIndices))

const accentCount = computed(() => (form.accentIndices || []).length)

const activeToolPanel = ref('design')

const toolPanels = computed(() => {
  const panels = [
    { id: 'design', label: 'Teks', icon: PencilSquareIcon },
    { id: 'size', label: 'Ukuran', icon: ArrowsPointingInIcon },
    { id: 'base', label: 'Base', icon: Square3Stack3DIcon },
    { id: 'insert', label: 'Insert', icon: RectangleGroupIcon },
    { id: 'attach', label: 'Kait', icon: LinkIcon }
  ]
  if (result.value) panels.push({ id: 'export', label: 'Export', icon: DocumentArrowDownIcon })
  return panels
})

const activePanelMeta = computed(
  () => toolPanels.value.find((p) => p.id === activeToolPanel.value) || toolPanels.value[0]
)

function selectToolPanel(id) {
  activeToolPanel.value = id
}

const wizardDone = ref(false)

function applyThemeDefaults(themeId) {
  const theme = getKeychainTheme(themeId)
  const attachmentType = form.attachmentType
  const accentIndices = form.accentIndices
  Object.assign(form, { themeId: theme.id, ...theme.defaults, attachmentType, accentIndices })
  form.fontUrl = theme.fontUrl
  form.typographyId = theme.typographyId || 'straight'
  form.colors = { ...theme.colors }
}

const generating = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const result = ref(null)
const previewKey = ref(0)
const activePreview = ref('assembly')
const basePreviewParts = ref([])
const textPreviewParts = ref([])
const assemblyPreviewParts = ref([])

const activePreviewParts = computed(() => {
  if (activePreview.value === 'base') return basePreviewParts.value
  if (activePreview.value === 'text') return textPreviewParts.value
  return assemblyPreviewParts.value
})
const activePreviewFilename = computed(() => {
  if (activePreview.value === 'base') return result.value?.baseFilename
  if (activePreview.value === 'text') return result.value?.textFilename
  return `${result.value?.baseFilename} + ${result.value?.textFilename}`
})

const previewTabs = [
  { id: 'assembly', label: 'Perakitan' },
  { id: 'base', label: 'Base' },
  { id: 'text', label: 'Teks' }
]

let disposePrev = null
let generateToken = 0

function clearPreviews() {
  basePreviewParts.value = []
  textPreviewParts.value = []
  assemblyPreviewParts.value = []
}

onUnmounted(() => {
  clearPreviews()
  disposePrev?.()
})

async function runGenerate() {
  const token = ++generateToken
  generating.value = true
  errorMsg.value = ''
  const prevDispose = disposePrev
  disposePrev = null
  clearPreviews()
  previewKey.value += 1
  await nextTick()
  prevDispose?.()
  try {
    const out = await generateKeychain({ ...form, colors: { ...form.colors } })
    if (token !== generateToken) {
      out.dispose()
      return
    }
    disposePrev = () => out.dispose()
    result.value = out
    previewKey.value += 1
    basePreviewParts.value = out.basePreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line
    }))
    textPreviewParts.value = out.textPreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line
    }))
    assemblyPreviewParts.value = out.assemblyPreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line
    }))
  } catch (e) {
    if (token !== generateToken) return
    result.value = null
    errorMsg.value = e?.message || 'Gagal membuat model keychain'
  } finally {
    if (token === generateToken) generating.value = false
  }
}

async function downloadPart(part) {
  if (!result.value) return
  const slug = result.value.slug
  const fmt = exportFormat.value
  let blob
  let filename

  if (part === 'base') {
    if (fmt === '3mf') {
      blob = result.value.getBase3mfBlob()
      filename = exportFilename(slug, 'base', fmt)
    } else if (fmt === 'glb') {
      blob = await result.value.getBaseGlbBlob()
      filename = exportFilename(slug, 'base', fmt)
    } else if (fmt === 'stl-parts') {
      blob = result.value.getBaseMultiStlBlob()
      filename = exportFilename(slug, 'base', fmt)
    } else if (fmt === 'stl-color') {
      blob = result.value.getBaseColoredStlBlob()
      filename = exportFilename(slug, 'base', fmt)
    } else {
      blob = result.value.getBaseBlob()
      filename = result.value.baseFilename
    }
  } else {
    if (fmt === '3mf') {
      blob = result.value.getText3mfBlob()
      filename = exportFilename(slug, 'text', fmt)
    } else if (fmt === 'glb') {
      blob = await result.value.getTextGlbBlob()
      filename = exportFilename(slug, 'text', fmt)
    } else if (fmt === 'stl-parts') {
      blob = result.value.getTextMultiStlBlob()
      filename = exportFilename(slug, 'text', fmt)
    } else if (fmt === 'stl-color') {
      blob = result.value.getTextColoredStlBlob()
      filename = exportFilename(slug, 'text', fmt)
    } else {
      blob = result.value.getTextBlob()
      filename = result.value.textFilename
    }
  }

  downloadBlob(blob, filename)
  const fmtLabel = exportFormats.find((f) => f.id === fmt)?.label || fmt
  toast.success(`Unduh ${part === 'base' ? 'base' : 'teks'} (${fmtLabel})`)
}

function uploadBlob(blob, filename) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', new File([blob], filename, { type: exportMime(exportFormat.value) }))
    xhr.open('POST', '/api/library-files')
    xhr.withCredentials = true
    xhr.onload = () => {
      let body = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body?.statusMessage || 'Upload gagal'))
    }
    xhr.onerror = () => reject(new Error('Upload gagal'))
    xhr.send(fd)
  })
}

async function saveToGallery() {
  if (!result.value || !isAdmin.value) return
  saving.value = true
  errorMsg.value = ''
  try {
    await uploadBlob(result.value.getBaseBlob(), result.value.baseFilename)
    await uploadBlob(result.value.getTextBlob(), result.value.textFilename)
    toast.success('Base & teks disimpan ke Galeri 3D')
  } catch (e) {
    errorMsg.value = e?.message || 'Gagal menyimpan ke galeri'
  } finally {
    saving.value = false
  }
}

function onWizardComplete(payload) {
  const theme = getKeychainTheme(payload.themeId)
  Object.assign(form, { ...theme.defaults })
  form.themeId = payload.themeId
  form.fontUrl = payload.fontUrl || theme.fontUrl
  form.typographyId = payload.typographyId || theme.typographyId || 'straight'
  form.text = payload.text
  form.svgContent = payload.svgContent || ''
  form.svgSizeMm = payload.svgSizeMm ?? 14
  form.svgGapMm = payload.svgGapMm ?? 2
  form.attachmentType = payload.attachmentType
  form.targetWidthMm = payload.targetWidthMm
  form.targetHeightMm = payload.targetHeightMm
  form.accentIndices = [...(payload.accentIndices || [])]
  form.colors = { ...payload.colors }
  wizardDone.value = true
  runGenerate()
}

function restartWizard() {
  wizardDone.value = false
  result.value = null
  clearPreviews()
  const prevDispose = disposePrev
  disposePrev = null
  prevDispose?.()
}
</script>

<template>
  <KeychainWizard v-if="!wizardDone" @complete="onWizardComplete" />

  <div class="h-full flex flex-col p-2 sm:p-3 min-h-0" :class="{ 'invisible pointer-events-none': !wizardDone }">
    <!-- Canva-style editor -->
    <div class="panel overflow-hidden flex flex-col md:flex-row flex-1 min-h-0">
      <!-- Icon rail -->
      <nav
        class="order-2 md:order-1 flex md:flex-col items-stretch md:items-center gap-0.5 md:gap-1 px-1 py-1 md:py-3 md:w-[3.75rem] shrink-0 border-t md:border-t-0 md:border-r border-ink-200 bg-ink-50 overflow-x-auto md:overflow-visible"
        aria-label="Panel alat"
      >
        <button
          v-for="panel in toolPanels"
          :key="panel.id"
          type="button"
          class="flex md:flex-col items-center justify-center gap-0.5 min-w-[3.25rem] md:w-full px-2 py-2 md:py-2.5 rounded-lg text-[10px] font-medium transition-colors shrink-0"
          :class="
            activeToolPanel === panel.id
              ? 'bg-white text-accent-700 shadow-sm ring-1 ring-ink-200'
              : 'text-ink-500 hover:bg-white/70 hover:text-ink-700'
          "
          @click="selectToolPanel(panel.id)"
        >
          <component :is="panel.icon" class="w-5 h-5 shrink-0" />
          <span class="leading-none">{{ panel.label }}</span>
        </button>
        <div class="hidden md:block flex-1" />
        <button
          type="button"
          class="hidden md:flex flex-col items-center justify-center gap-0.5 w-full px-2 py-2.5 rounded-lg text-[10px] font-medium text-white bg-accent-500 hover:bg-accent-600 disabled:opacity-60"
          :disabled="generating"
          @click="runGenerate"
        >
          <ArrowPathIcon class="w-5 h-5" :class="generating ? 'animate-spin' : ''" />
          <span>{{ generating ? '…' : 'Generate' }}</span>
        </button>
      </nav>

      <!-- Flyout panel -->
      <aside
        class="order-1 md:order-2 w-full md:w-52 lg:w-56 shrink-0 border-b md:border-b-0 md:border-r border-ink-200 bg-white overflow-y-auto max-h-[42vh] md:max-h-none"
      >
        <header class="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-ink-100 bg-white/95 backdrop-blur-sm">
          <h2 class="text-xs font-semibold text-ink-800">{{ activePanelMeta?.label }}</h2>
          <button
            type="button"
            class="md:hidden btn-primary text-xs py-1 px-2"
            :disabled="generating"
            @click="runGenerate"
          >
            <ArrowPathIcon class="w-3.5 h-3.5" :class="generating ? 'animate-spin' : ''" />
            Generate
          </button>
        </header>

        <div class="p-3 space-y-3">
          <!-- Design -->
          <template v-if="activeToolPanel === 'design'">
            <button type="button" class="text-[11px] text-accent-600 hover:underline mb-1" @click="restartWizard">
              Setup ulang…
            </button>
            <KeychainCompactField label="Teks keychain">
              <input v-model="form.text" class="input text-sm" maxlength="40" :placeholder="TEXT_PLACEHOLDER" />
            </KeychainCompactField>

            <KeychainSvgUpload
              v-model:svg-content="form.svgContent"
              v-model:svg-size-mm="form.svgSizeMm"
              v-model:svg-gap-mm="form.svgGapMm"
            />

            <KeychainAccentPicker
              v-if="form.text"
              v-model:accent-indices="form.accentIndices"
              :text="form.text"
              :letter-color="form.colors.letter"
              :accent-color="form.colors.accent"
            />

            <KeychainCompactField label="Theme">
              <select v-model="form.themeId" class="input text-sm" @change="applyThemeDefaults(form.themeId)">
                <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </KeychainCompactField>

            <KeychainFontPicker
              v-model="form.fontUrl"
              :preview-text="form.text || TEXT_PLACEHOLDER"
              :show-preview="false"
            />

            <KeychainTypographyPicker v-model="form.typographyId" />

            <KeychainCompactField label="Attachment" :hint="activeAttachment.description">
              <select v-model="form.attachmentType" class="input text-sm">
                <option v-for="t in attachmentTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </KeychainCompactField>
          </template>

          <!-- Size -->
          <template v-else-if="activeToolPanel === 'size'">
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Tinggi">
                <input v-model.number="form.targetHeightMm" type="number" min="10" max="40" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Lebar teks">
                <input v-model.number="form.targetWidthMm" type="number" min="20" max="120" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <KeychainCompactField label="Padding body" hint="Jarak tepi body ke plate.">
              <input v-model.number="form.paddingMm" type="number" min="1" max="10" step="0.5" class="input-num w-full text-sm" />
            </KeychainCompactField>
          </template>

          <!-- Base -->
          <template v-else-if="activeToolPanel === 'base'">
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Tebal base">
                <input v-model.number="form.baseThicknessMm" type="number" min="2" max="8" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Lantai">
                <input v-model.number="form.floorThicknessMm" type="number" min="0.2" max="2" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <p class="text-[10px] font-mono text-ink-500 bg-ink-50 rounded px-2 py-1.5">
              Cavity {{ cavityDepthPreview }} mm
            </p>
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Clr. sisi" hint="Plate + jarak">
                <input v-model.number="form.cavityClearanceMm" type="number" min="0.05" max="0.5" step="0.02" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Clr. atas">
                <input v-model.number="form.topClearanceMm" type="number" min="0" max="0.3" step="0.02" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
          </template>

          <!-- Insert -->
          <template v-else-if="activeToolPanel === 'insert'">
            <KeychainCompactField
              label="Tebal teks"
              :hint="`Maks. ${maxTextPreview} mm`"
            >
              <input
                v-model.number="form.textThicknessMm"
                type="number"
                :max="insertFit.maxTextH"
                min="0.5"
                step="0.1"
                class="input-num w-full text-sm"
              />
              <p v-if="textThicknessWarning" class="text-[10px] text-amber-700 mt-1">{{ textThicknessWarning }}</p>
            </KeychainCompactField>
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Plate luar">
                <input v-model.number="form.plateOuterMarginMm" type="number" min="0" max="4" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Plate dalam">
                <input v-model.number="form.plateInnerBridgeMm" type="number" min="0" max="6" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <KeychainCompactField label="Jarak huruf" unit="mm">
              <input v-model.number="form.letterSpacingMm" type="number" min="-2" max="2" step="0.1" class="input-num w-full text-sm" />
            </KeychainCompactField>
          </template>

          <!-- Attach -->
          <template v-else-if="activeToolPanel === 'attach'">
            <template v-if="form.attachmentType === 'hole'">
              <div class="grid grid-cols-2 gap-2">
                <KeychainCompactField label="Ø eyelet">
                  <input v-model.number="form.eyeletOuterDiameterMm" type="number" min="5" max="14" step="0.5" class="input-num w-full text-sm" />
                </KeychainCompactField>
                <KeychainCompactField label="Ø lubang">
                  <input v-model.number="form.keyringHoleDiameterMm" type="number" min="3" max="8" step="0.1" class="input-num w-full text-sm" />
                </KeychainCompactField>
              </div>
              <KeychainCompactField
                label="Overlap"
                :hint="eyeletLayout ? `Offset teks ${eyeletLayout.attachReach.toFixed(1)} mm` : 'Kecil = keluar'"
              >
                <input v-model.number="form.eyeletOverlapMm" type="number" min="0.5" max="8" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </template>
            <template v-else>
              <div class="grid grid-cols-2 gap-2">
                <KeychainCompactField label="Ø hook">
                  <input v-model.number="form.hookOuterDiameterMm" type="number" min="6" max="16" step="0.5" class="input-num w-full text-sm" />
                </KeychainCompactField>
                <KeychainCompactField label="Tebal hook">
                  <input v-model.number="form.hookThicknessMm" type="number" min="1.5" max="5" step="0.1" class="input-num w-full text-sm" />
                </KeychainCompactField>
              </div>
              <KeychainCompactField label="Bukaan kait" unit="°">
                <input v-model.number="form.hookGapDegrees" type="number" min="30" max="90" step="5" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </template>
          </template>

          <!-- Export -->
          <template v-else-if="activeToolPanel === 'export' && result">
            <KeychainCompactField label="Format">
              <select v-model="exportFormat" class="input text-sm">
                <option v-for="f in exportFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
              </select>
            </KeychainCompactField>
            <div class="space-y-2">
              <button type="button" class="btn-secondary w-full text-sm" @click="downloadPart('base')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Base
              </button>
              <button type="button" class="btn-secondary w-full text-sm" @click="downloadPart('text')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Teks
              </button>
              <button
                v-if="isAdmin"
                type="button"
                class="btn-primary w-full text-sm"
                :disabled="saving"
                @click="saveToGallery"
              >
                <CloudArrowUpIcon class="w-4 h-4" />
                {{ saving ? 'Menyimpan…' : 'Galeri' }}
              </button>
            </div>
            <p class="text-[10px] text-ink-400 leading-relaxed">3MF untuk ACE Pro 2 · STL multi-part untuk split manual.</p>
          </template>

          <p v-if="errorMsg" class="text-xs text-red-600">{{ errorMsg }}</p>
        </div>
      </aside>

      <!-- Canvas / preview -->
      <div class="order-3 flex-1 min-w-0 flex flex-col">
        <!-- Toolbar: warna + tabs + stats -->
        <div class="shrink-0 border-b border-ink-200 bg-white px-3 py-2 space-y-2">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PaintBrushIcon class="w-4 h-4 text-accent-600 shrink-0" />

            <div class="flex flex-wrap items-center gap-2">
              <label
                v-for="c in TEXT_COLOR_FIELDS"
                :key="c.key"
                class="group relative flex flex-col items-center gap-0.5 cursor-pointer"
                :title="c.isAccent ? `${c.label}${accentCharsLabel ? `: ${accentCharsLabel}` : ' — klik huruf di panel Teks'}` : c.label"
              >
                <input
                  v-model="form.colors[c.key]"
                  type="color"
                  class="h-7 w-7 cursor-pointer rounded-md border-2 border-white shadow-sm ring-1 transition-transform group-hover:scale-105"
                  :class="c.isAccent ? 'ring-amber-400 ring-2' : 'ring-ink-200'"
                  @change="runGenerate"
                />
                <span class="text-[9px] text-ink-500 leading-none flex items-center gap-0.5">
                  <HashtagIcon v-if="c.isAccent" class="w-2.5 h-2.5" />
                  {{ c.short }}
                </span>
                <span
                  v-if="c.isAccent && accentCount"
                  class="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-amber-500 text-[8px] font-bold text-white leading-none flex items-center justify-center"
                >
                  {{ accentCount }}
                </span>
              </label>
            </div>

            <div class="hidden sm:block w-px h-6 bg-ink-200" />

            <div class="flex flex-wrap items-center gap-2">
              <label
                v-for="c in BASE_COLOR_FIELDS"
                :key="c.key"
                class="group flex flex-col items-center gap-0.5 cursor-pointer"
                :title="c.label"
              >
                <input
                  v-model="form.colors[c.key]"
                  type="color"
                  class="h-7 w-7 cursor-pointer rounded-md border-2 border-white shadow-sm ring-1 ring-ink-200 transition-transform group-hover:scale-105"
                  @change="runGenerate"
                />
                <span class="text-[9px] text-ink-500 leading-none">{{ c.short }}</span>
              </label>
            </div>

            <div v-if="result" class="hidden lg:flex items-center gap-3 ml-auto text-[10px] font-mono text-ink-500">
              <span>{{ result.dimensions.widthMm }}×{{ result.dimensions.heightMm }} mm</span>
              <span class="text-ink-300">|</span>
              <span>Cavity {{ result.dimensions.cavityDepthMm }}</span>
              <span class="text-ink-300">|</span>
              <span :class="result.dimensions.textClamped ? 'text-amber-700' : ''">Teks {{ result.dimensions.textThicknessMm }}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div v-if="result" class="flex rounded-md border border-ink-200 overflow-hidden text-[11px]">
              <button
                v-for="tab in previewTabs"
                :key="tab.id"
                type="button"
                class="px-2.5 py-1 transition-colors border-l border-ink-200 first:border-l-0"
                :class="activePreview === tab.id ? 'bg-ink-800 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'"
                @click="activePreview = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>
            <span v-if="result" class="text-[10px] text-ink-400 font-mono truncate max-w-[12rem]">{{ activePreviewFilename }}</span>
          </div>
        </div>

        <!-- 3D viewport -->
        <div class="relative flex-1 min-h-[18rem] sm:min-h-[24rem] bg-gradient-to-b from-ink-50 to-ink-100/80">
          <ClientOnly>
            <KeychainPreview
              v-if="activePreviewParts.length"
              :key="`${activePreview}-${previewKey}`"
              :parts="activePreviewParts"
              class="absolute inset-0 h-full w-full"
            />
            <div
              v-else-if="generating"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-ink-500"
            >
              <ArrowPathIcon class="w-6 h-6 animate-spin text-accent-500" />
              Membuat model…
            </div>
            <div
              v-else
              class="absolute inset-0 flex items-center justify-center text-xs text-ink-400 px-4 text-center"
            >
              Atur parameter · klik Generate
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
