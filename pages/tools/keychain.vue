<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'Keychain Generator',
  toolFullBleed: true
})

import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
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
  generateKeychain
} from '~/utils/keychainGenerator.js'
import { downloadBlob } from '~/utils/downloadBlob.js'
import { resolveGeneratorPartExport } from '~/utils/generatorPartExport.js'
import { resolveInsertFit } from '~/utils/keychainCore.js'
import { EXPORT_FORMATS, exportMime } from '~/utils/keychainExport.js'
import { resolveEyeletLayout } from '~/utils/shapeClipper.js'
import { KEYCHAIN_THEME_LIST, getKeychainTheme } from '~/utils/keychainThemes.js'
import ToolColorBar from '~/components/ToolColorBar.vue'
import ToolPanelShell from '~/components/ToolPanelShell.vue'
import PreviewViewLegend from '~/components/PreviewViewLegend.vue'
import { buildPartLegend } from '~/utils/previewPartLabels.js'
import { accentIndicesToLabel } from '~/utils/keychainAccent.js'

const { layoutConfig, deviceLabel, modeLabel } = useUiLayout()

const TEXT_PLACEHOLDER = 'Contoh: NAMA 07'

const TEXT_COLOR_FIELDS = [
  { key: 'plate', label: 'Plate', short: 'Plate', materialType: 'filament' },
  { key: 'letter', label: 'Huruf', short: 'Huruf', materialType: 'filament' },
  { key: 'accent', label: 'Aksen', short: 'Aksen', isAccent: true, materialType: 'filament' }
]

const BASE_COLOR_FIELDS = [
  { key: 'baseHighlight', label: 'Rim', short: 'Rim', materialType: 'filament' },
  { key: 'baseBottom', label: 'Dasar', short: 'Dasar', materialType: 'filament' },
  { key: 'cavityWall', label: 'Cavity', short: 'Cavity', materialType: 'filament' }
]
const HPP_COLOR_FIELDS = [...TEXT_COLOR_FIELDS, ...BASE_COLOR_FIELDS]

const { mode: colorMode } = useToolColorMode()
const colorMaterialIds = ref({})

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

const TOOL_PANELS = [
  { id: 'design', label: 'Teks', icon: PencilSquareIcon },
  { id: 'size', label: 'Ukuran', icon: ArrowsPointingInIcon },
  { id: 'base', label: 'Base', icon: Square3Stack3DIcon },
  { id: 'colors', label: 'Warna', icon: PaintBrushIcon },
  { id: 'insert', label: 'Insert', icon: RectangleGroupIcon },
  { id: 'attach', label: 'Kait', icon: LinkIcon },
  { id: 'export', label: 'Export', icon: DocumentArrowDownIcon, needsResult: true }
]

const toolPanels = TOOL_PANELS

const activePanelMeta = computed(
  () => toolPanels.find((p) => p.id === activeToolPanel.value) || toolPanels[0]
)

function selectToolPanel(id) {
  const panel = toolPanels.find((p) => p.id === id)
  if (panel?.needsResult && !result.value) {
    toast.info('Generate model dulu untuk membuka Export')
    return
  }
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
const result = ref(null)
const previewKey = ref(0)
const activePreview = ref('assembly')
const selectedPartId = ref('')
const explodeFactor = ref(0)
const autoExplode = ref(false)
const showPreviewGrid = ref(true)
const assemblyResetToken = ref(0)
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

const previewTabs = computed(() => [
  { id: 'assembly', label: 'Perakitan', colors: [form.colors.base, form.colors.letter] },
  { id: 'base', label: 'Base', color: form.colors.base },
  { id: 'text', label: 'Teks', color: form.colors.letter }
])

const assemblyPartLegend = computed(() => buildPartLegend(assemblyPreviewParts.value))
const isAssemblyView = computed(() => activePreview.value === 'assembly')

function resetAssemblyPreview() {
  explodeFactor.value = 0
  autoExplode.value = false
  selectedPartId.value = ''
  assemblyResetToken.value++
}

let disposePrev = null
let generateToken = 0
const generationState = useGeneratorState(form, result, generateModel)
const { runGenerate, ensureFreshResult, isFresh: isResultFresh } = generationState

function clearPreviews() {
  basePreviewParts.value = []
  textPreviewParts.value = []
  assemblyPreviewParts.value = []
}

onUnmounted(() => {
  generateToken++
  result.value = null
  clearPreviews()
  disposePrev?.()
})

async function generateModel() {
  const token = ++generateToken
  generating.value = true
  result.value = null
  const prevDispose = disposePrev
  disposePrev = null
  clearPreviews()
  previewKey.value += 1
  await nextTick()
  prevDispose?.()
  if (token !== generateToken) return
  const revision = generationState.revision.value
  try {
    const out = await generateKeychain({ ...form, colors: { ...form.colors } })
    if (token !== generateToken) {
      out.dispose()
      return
    }
    disposePrev = () => out.dispose()
    result.value = out
    generationState.markGenerated(revision)
    previewKey.value += 1
    basePreviewParts.value = out.basePreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name
    }))
    textPreviewParts.value = out.textPreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name
    }))
    assemblyPreviewParts.value = out.assemblyPreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name
    }))
    selectedPartId.value = ''
    explodeFactor.value = 0
    autoExplode.value = false
  } catch (e) {
    if (token !== generateToken) return
    result.value = null
    toast.error(e?.message || 'Gagal membuat model keychain')
  } finally {
    if (token === generateToken) generating.value = false
  }
}

async function downloadPart(part) {
  try {
    if (!(await ensureFreshResult())) return
    const fmt = exportFormat.value
    const { blob, filename } = await resolveGeneratorPartExport(result.value, part, fmt)
    if (!blob) throw new Error('Part tidak tersedia')
    downloadBlob(blob, filename)
    const fmtLabel = exportFormats.find((f) => f.id === fmt)?.label || fmt
    const partLabel = part === 'base' ? 'base' : 'teks'
    toast.success(`Unduh ${partLabel} (${fmtLabel})`)
  } catch (error) {
    toast.error(error?.message || 'Export gagal')
  }
}

function uploadBlob(blob, filename) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', new File([blob], filename, { type: blob.type || exportMime(exportFormat.value) }))
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
    xhr.timeout = 120000
    xhr.ontimeout = () => reject(new Error('Upload melewati batas waktu'))
    xhr.onabort = () => reject(new Error('Upload dibatalkan'))
    xhr.onerror = () => reject(new Error('Upload gagal'))
    xhr.send(fd)
  })
}

async function saveToGallery() {
  if (saving.value || !isAdmin.value) return
  saving.value = true
  try {
    if (!(await ensureFreshResult())) return
    const model = result.value
    const fmt = exportFormat.value
    const files = await Promise.all(['base', 'text'].map((part) =>
      resolveGeneratorPartExport(model, part, fmt)
    ))
    if (!files[0]?.blob) throw new Error('Part utama tidak tersedia')
    for (const file of files) {
      if (file.blob) await uploadBlob(file.blob, file.filename)
    }
    const fmtLabel = exportFormats.find((f) => f.id === fmt)?.label || fmt
    toast.success(`Model disimpan ke Galeri 3D (${fmtLabel})`)
  } catch (e) {
    toast.error(e?.message || 'Gagal menyimpan ke galeri')
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
  generationState.invalidate()
  generateToken++
  generating.value = false
  wizardDone.value = false
  result.value = null
  clearPreviews()
  const prevDispose = disposePrev
  disposePrev = null
  prevDispose?.()
}
const { downloadPlate, exportingPlate } = usePrintPlateExport(result, ensureFreshResult)

</script>

<template>
  <KeychainWizard v-if="!wizardDone" @complete="onWizardComplete" />

  <div class="h-full flex flex-col p-2 sm:p-3 min-h-0" :class="{ 'invisible pointer-events-none': !wizardDone }">
    <!-- Canva-style editor -->
    <div class="panel overflow-hidden flex flex-1 min-h-0" :class="layoutConfig.editorClass">
      <ToolPanelShell
        :panels="toolPanels"
        :active-panel="activeToolPanel"
        :active-panel-meta="activePanelMeta"
        :generating="generating"
        :result="result"
        @select="selectToolPanel"
        @generate="runGenerate"
      >
          <!-- Design -->
          <template v-if="activeToolPanel === 'design'">
            <button type="button" class="btn-secondary w-full text-sm" @click="restartWizard">
              <ArrowUturnLeftIcon class="w-4 h-4" />
              Setup ulang
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

          <!-- Colors -->
          <template v-else-if="activeToolPanel === 'colors'">
            <p class="text-xs text-ink-500">Material dari stok, 1 warna abu-abu, atau hex.</p>
            <div class="space-y-4">
              <div class="space-y-2">
                <p class="text-xs font-medium text-ink-600">Teks & plate</p>
                <ToolColorBar
                  v-model:mode="colorMode"
                  v-model:colors="form.colors"
                  v-model:material-ids="colorMaterialIds"
                  :fields="TEXT_COLOR_FIELDS"
                  variant="list"
                  @change="runGenerate"
                />
              </div>
              <div class="space-y-2">
                <p class="text-xs font-medium text-ink-600">Base & cavity</p>
                <ToolColorBar
                  v-model:mode="colorMode"
                  v-model:colors="form.colors"
                  v-model:material-ids="colorMaterialIds"
                  :fields="BASE_COLOR_FIELDS"
                  :show-mode-switch="false"
                  variant="list"
                  @change="runGenerate"
                />
              </div>
            </div>
          </template>

          <!-- Export -->
          <template v-else-if="activeToolPanel === 'export'">
            <template v-if="result">
              <KeychainCompactField label="Format">
                <select v-model="exportFormat" class="input text-sm">
                  <option v-for="f in exportFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
                </select>
              </KeychainCompactField>
              <PrintPlateExport v-if="exportFormat === '3mf'" :busy="exportingPlate" @download="downloadPlate" />
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
              <GeneratorHppPanel
                :result="isResultFresh ? result : null"
                :color-fields="HPP_COLOR_FIELDS"
                :material-ids="colorMaterialIds"
                :colors="form.colors"
                :color-mode="colorMode"
              />
              <p class="text-[10px] text-ink-400 leading-relaxed">3MF OrcaSlicer · Bagian warna tetap tergabung dalam satu objek.</p>
            </template>
            <p v-else class="text-xs text-ink-500 text-center py-8">Generate model dulu untuk export.</p>
          </template>
      </ToolPanelShell>

      <!-- Canvas / preview -->
      <div :class="[layoutConfig.previewOrder, layoutConfig.previewClass]">
        <div class="sticky top-0 z-10 shrink-0 border-b border-ink-200 bg-white/95 backdrop-blur-sm shadow-sm px-3 py-2 space-y-2">
          <div v-if="result" class="hidden lg:flex items-center gap-3 text-[10px] font-mono text-ink-500">
            <span>{{ result.dimensions.widthMm }}×{{ result.dimensions.heightMm }} mm</span>
            <span class="text-ink-300">|</span>
            <span>Cavity {{ result.dimensions.cavityDepthMm }}</span>
            <span class="text-ink-300">|</span>
            <span :class="result.dimensions.textClamped ? 'text-amber-700' : ''">Teks {{ result.dimensions.textThicknessMm }}</span>
          </div>

          <p v-if="result" class="text-[10px] text-ink-400">
            {{ deviceLabel }} · mode {{ modeLabel }} · legend preview dapat dipindah & minimize
          </p>
        </div>

        <!-- 3D viewport -->
        <div
          class="relative flex-1 min-h-[18rem] sm:min-h-[24rem] bg-gradient-to-b from-ink-50 to-ink-100/80 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:24px_24px]"
        >
          <ClientOnly>
            <template v-if="activePreviewParts.length">
              <KeychainPreview
                :key="previewKey"
                v-model:selected-part-id="selectedPartId"
                :parts="activePreviewParts"
                :show-grid="showPreviewGrid"
                :assembly-reset-token="assemblyResetToken"
                :interactive-assembly="isAssemblyView"
                :explode-factor="explodeFactor"
                :auto-explode="autoExplode"
                class="absolute inset-0 h-full w-full"
              />
              <PreviewViewLegend
                v-model:active-view="activePreview"
                v-model:selected-part-id="selectedPartId"
                v-model:explode-factor="explodeFactor"
                v-model:auto-explode="autoExplode"
                v-model:show-grid="showPreviewGrid"
                :view-tabs="previewTabs"
                :part-legend="assemblyPartLegend"
                :show-assembly-controls="isAssemblyView"
                :filename="result ? activePreviewFilename : ''"
                :disabled="!result"
                @reset-positions="resetAssemblyPreview"
              />
            </template>
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
