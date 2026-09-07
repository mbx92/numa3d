<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'Lightbox Generator',
  toolFullBleed: true
})

import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  CloudArrowUpIcon,
  LightBulbIcon,
  ArrowsPointingInIcon,
  Square3Stack3DIcon,
  PaintBrushIcon,
  DocumentArrowDownIcon,
  PencilSquareIcon
} from '@heroicons/vue/24/outline'
import { LIGHTBOX_DEFAULTS, getStandPreset } from '~/utils/lightboxPresets.js'
import { generateLightbox } from '~/utils/lightboxGenerator.js'
import { downloadBlob } from '~/utils/downloadBlob.js'
import { EXPORT_FORMATS, exportFilename, exportMime } from '~/utils/keychainExport.js'
import ToolColorBar from '~/components/ToolColorBar.vue'
import ToolPanelShell from '~/components/ToolPanelShell.vue'
import PreviewViewLegend from '~/components/PreviewViewLegend.vue'
import { buildPartLegend } from '~/utils/previewPartLabels.js'

const COLOR_FIELDS = computed(() => {
  if (form.designMode === 'text' || form.designMode === 'svg' || form.designMode === 'svg-qr') {
    return [
      { key: 'background', label: 'Latar', short: 'Latar', materialType: 'filament' },
      { key: 'text', label: 'Desain', short: 'Desain', materialType: 'filament' },
      { key: 'frame', label: 'Frame', short: 'Frame', materialType: 'filament' },
      { key: 'back', label: 'Back', short: 'Back', materialType: 'filament' }
    ]
  }
  return [
    { key: 'frame', label: 'Frame', short: 'Frame', materialType: 'filament' },
    { key: 'back', label: 'Back', short: 'Back', materialType: 'filament' }
  ]
})

const { mode: colorMode } = useToolColorMode()
const colorMaterialIds = ref({})

const exportFormats = EXPORT_FORMATS
const { layoutConfig, deviceLabel, modeLabel } = useUiLayout()

const form = reactive({
  ...LIGHTBOX_DEFAULTS,
  colors: { ...LIGHTBOX_DEFAULTS.colors }
})

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()
const exportFormat = ref('3mf')
const activeToolPanel = ref('design')

const TOOL_PANELS = [
  { id: 'design', label: 'Desain', icon: PencilSquareIcon },
  { id: 'led', label: 'LED', icon: LightBulbIcon },
  { id: 'stand', label: 'Stand', icon: Square3Stack3DIcon },
  { id: 'size', label: 'Ukuran', icon: ArrowsPointingInIcon },
  { id: 'colors', label: 'Warna', icon: PaintBrushIcon },
  { id: 'info', label: 'Info', icon: Square3Stack3DIcon },
  { id: 'export', label: 'Export', icon: DocumentArrowDownIcon, needsResult: true }
]

const toolPanels = TOOL_PANELS

const activeStandPreset = computed(() => getStandPreset(form.standModelId))

function selectToolPanel(id) {
  const panel = toolPanels.find((p) => p.id === id)
  if (panel?.needsResult && !result.value) {
    toast.info('Generate model dulu untuk membuka Export')
    return
  }
  activeToolPanel.value = id
}

const activePanelMeta = computed(
  () => toolPanels.find((p) => p.id === activeToolPanel.value) || toolPanels[0]
)

const wizardDone = ref(false)
const generating = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const result = ref(null)
const resultSignature = ref('')
const previewKey = ref(0)
const activePreview = ref('assembly')
const selectedPartId = ref('')
const explodeFactor = ref(0)
const autoExplode = ref(false)
const showPreviewGrid = ref(true)
const assemblyResetToken = ref(0)
const facePreviewParts = ref([])
const bodyPreviewParts = ref([])
const standPreviewParts = ref([])
const assemblyPreviewParts = ref([])

const activePreviewParts = computed(() => {
  if (activePreview.value === 'face') return facePreviewParts.value
  if (activePreview.value === 'body') return bodyPreviewParts.value
  if (activePreview.value === 'stand') return standPreviewParts.value
  return assemblyPreviewParts.value
})

const editableLayerPalette = computed(() => {
  if (!result.value || !['image', 'svg', 'svg-qr'].includes(form.designMode)) return []
  return (result.value.layerPalette || []).filter((layer) => !layer.isDiffuser)
})

const previewTabs = computed(() => {
  const tabs = [
    { id: 'assembly', label: 'Perakitan', colors: [form.colors.frame, form.colors.text || form.colors.background] },
    { id: 'face', label: 'Front & Side', color: form.colors.text || form.colors.background },
    { id: 'body', label: 'Back', color: form.colors.back }
  ]
  if (result.value?.standPreviewParts?.length) {
    tabs.push({ id: 'stand', label: 'Stand', color: form.colors.frame })
  }
  return tabs
})

const assemblyPartLegend = computed(() => buildPartLegend(assemblyPreviewParts.value))
const isAssemblyView = computed(() => activePreview.value === 'assembly')

function resetAssemblyPreview() {
  explodeFactor.value = 0
  autoExplode.value = false
  selectedPartId.value = ''
  assemblyResetToken.value++
}

const activePreviewFilename = computed(() => {
  if (activePreview.value === 'face') return result.value?.frontSideFilename || result.value?.baseFilename
  if (activePreview.value === 'body') return result.value?.backFilename || result.value?.bodyFilename
  if (activePreview.value === 'stand') return result.value?.standFilename
  return `${result.value?.slug}_assembly`
})

let disposePrev = null
let generateToken = 0
let queuedGenerateTimer = null

watch(
  () => [form.designMode, form.imageDataUrl, form.svgContent, form.maxColors],
  () => {
    form.layerColors = []
  }
)

watch(
  () => [
    form.standEnabled,
    form.standModelId,
    form.standWidthMm,
    form.standDepthMm,
    form.standBaseHeightMm,
    form.standRailHeightMm,
    form.standSlotMm,
    form.standColor
  ],
  () => {
    if (!wizardDone.value || !result.value) return
    queueGenerate()
  }
)

function queueGenerate() {
  if (queuedGenerateTimer) clearTimeout(queuedGenerateTimer)
  queuedGenerateTimer = setTimeout(() => {
    queuedGenerateTimer = null
    runGenerate()
  }, 180)
}

function clearPreviews() {
  facePreviewParts.value = []
  bodyPreviewParts.value = []
  standPreviewParts.value = []
  assemblyPreviewParts.value = []
}

function buildFormSignature() {
  return JSON.stringify({
    ...form,
    colors: { ...form.colors },
    layerColors: Array.isArray(form.layerColors) ? [...form.layerColors] : []
  })
}

async function ensureFreshResult() {
  const signature = buildFormSignature()
  if (queuedGenerateTimer) {
    clearTimeout(queuedGenerateTimer)
    queuedGenerateTimer = null
  }
  if (!result.value || resultSignature.value !== signature || generating.value) {
    await runGenerate()
  }
  return !!result.value && resultSignature.value === buildFormSignature()
}

onUnmounted(() => {
  if (queuedGenerateTimer) clearTimeout(queuedGenerateTimer)
  clearPreviews()
  disposePrev?.()
})

async function runGenerate() {
  const token = ++generateToken
  const signature = buildFormSignature()
  generating.value = true
  errorMsg.value = ''
  const prevDispose = disposePrev
  disposePrev = null
  clearPreviews()
  previewKey.value += 1
  await nextTick()
  prevDispose?.()
  try {
    const out = await generateLightbox({ ...form, colors: { ...form.colors } })
    if (token !== generateToken) {
      out.dispose()
      return
    }
    disposePrev = () => out.dispose()
    result.value = out
    resultSignature.value = signature
    if (activePreview.value === 'stand' && !out.standPreviewParts.length) activePreview.value = 'assembly'
    previewKey.value += 1
    facePreviewParts.value = out.facePreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name,
      previewOnly: p.previewOnly,
      opacity: p.opacity,
      glow: p.glow,
      glowIntensity: p.glowIntensity
    }))
    bodyPreviewParts.value = out.bodyPreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name,
      previewOnly: p.previewOnly,
      opacity: p.opacity,
      glow: p.glow,
      glowIntensity: p.glowIntensity
    }))
    standPreviewParts.value = out.standPreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name,
      previewOnly: p.previewOnly,
      opacity: p.opacity,
      glow: p.glow,
      glowIntensity: p.glowIntensity
    }))
    assemblyPreviewParts.value = out.assemblyPreviewParts.map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name,
      previewOnly: p.previewOnly,
      opacity: p.opacity,
      glow: p.glow,
      glowIntensity: p.glowIntensity
    }))
    selectedPartId.value = ''
    explodeFactor.value = 0
    autoExplode.value = false
  } catch (e) {
    if (token !== generateToken) return
    result.value = null
    resultSignature.value = ''
    errorMsg.value = e?.message || 'Gagal membuat model lightbox'
  } finally {
    if (token === generateToken) generating.value = false
  }
}

function updateLayerPaletteColor(layer, color) {
  if (layer.isBackground && (form.designMode === 'svg' || form.designMode === 'svg-qr')) {
    form.colors.background = color
  } else if (layer.name === 'Teks bawah' || layer.name === 'qr_caption') {
    form.colors.text = color
  } else if (Number.isInteger(layer.overrideIndex)) {
    const next = Array.isArray(form.layerColors) ? [...form.layerColors] : []
    next[layer.overrideIndex] = color
    form.layerColors = next
  }
  runGenerate()
}

async function downloadPart(part) {
  try {
    if (!(await ensureFreshResult())) return
    const slug = result.value.slug
    const fmt = exportFormat.value
    let blob
    let filename

    if (part === 'assembly') {
      if (fmt === '3mf') {
        blob = result.value.getAssembly3mfBlob()
        filename = exportFilename(slug, 'assembly', fmt)
      } else if (fmt === 'glb') {
        blob = await result.value.getAssemblyGlbBlob()
        filename = exportFilename(slug, 'assembly', fmt)
      } else {
        toast.error('Assembly hanya tersedia untuk 3MF dan GLB')
        return
      }
    } else if (part === 'face') {
      if (fmt === '3mf') {
        blob = result.value.getFrontSide3mfBlob?.() || result.value.getFace3mfBlob()
        filename = exportFilename(slug, 'face', fmt)
      } else if (fmt === 'glb') {
        blob = await (result.value.getFrontSideGlbBlob?.() || result.value.getFaceGlbBlob())
        filename = exportFilename(slug, 'face', fmt)
      } else if (fmt === 'stl-parts') {
        blob = result.value.getFrontSideMultiStlBlob?.() || result.value.getFaceMultiStlBlob()
        filename = exportFilename(slug, 'face', fmt)
      } else if (fmt === 'stl-color') {
        blob = result.value.getFrontSideColoredStlBlob?.() || result.value.getFaceColoredStlBlob()
        filename = exportFilename(slug, 'face', fmt)
      } else {
        blob = result.value.getFrontSideBlob?.() || result.value.getFaceBlob()
        filename = result.value.frontSideFilename || result.value.baseFilename
      }
    } else if (part === 'body') {
      if (fmt === '3mf') {
        blob = result.value.getBack3mfBlob?.() || result.value.getBody3mfBlob()
        filename = exportFilename(slug, 'body', fmt)
      } else if (fmt === 'glb') {
        blob = await (result.value.getBackGlbBlob?.() || result.value.getBodyGlbBlob())
        filename = exportFilename(slug, 'body', fmt)
      } else if (fmt === 'stl-parts') {
        blob = result.value.getBackMultiStlBlob?.() || result.value.getBodyMultiStlBlob()
        filename = exportFilename(slug, 'body', fmt)
      } else if (fmt === 'stl-color') {
        blob = result.value.getBackColoredStlBlob?.() || result.value.getBodyColoredStlBlob()
        filename = exportFilename(slug, 'body', fmt)
      } else {
        blob = result.value.getBackBlob?.() || result.value.getBodyBlob()
        filename = result.value.backFilename || result.value.bodyFilename
      }
    } else if (part === 'stand') {
      const standPartName = `stand_${result.value.dimensions?.standModelId || form.standModelId || 'model'}`
      if (fmt === '3mf') {
        blob = result.value.getStand3mfBlob()
        filename = exportFilename(slug, standPartName, fmt)
      } else if (fmt === 'glb') {
        blob = await result.value.getStandGlbBlob()
        filename = exportFilename(slug, standPartName, fmt)
      } else if (fmt === 'stl-parts') {
        blob = result.value.getStandMultiStlBlob()
        filename = exportFilename(slug, standPartName, fmt)
      } else if (fmt === 'stl-color') {
        blob = result.value.getStandColoredStlBlob()
        filename = exportFilename(slug, standPartName, fmt)
      } else {
        blob = result.value.getStandBlob()
        filename = result.value.standFilename
      }
    }

    if (!blob) {
      toast.error('Part tidak tersedia')
      return
    }
    downloadBlob(blob, filename)
    const fmtLabel = exportFormats.find((f) => f.id === fmt)?.label || fmt
    const partLabel = part === 'face' ? 'front & side' : part === 'body' ? 'back' : part
    toast.success(`Unduh ${partLabel} (${fmtLabel})`)
  } catch (error) {
    toast.error(error.message || 'Export gagal')
  }
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
  if (!isAdmin.value || !(await ensureFreshResult())) return
  saving.value = true
  errorMsg.value = ''
  try {
    await uploadBlob(result.value.getFrontSideBlob?.() || result.value.getFaceBlob(), result.value.frontSideFilename || result.value.baseFilename)
    await uploadBlob(result.value.getBackBlob?.() || result.value.getBodyBlob(), result.value.backFilename || result.value.bodyFilename)
    const standBlob = result.value.getStandBlob?.()
    if (standBlob) await uploadBlob(standBlob, result.value.standFilename)
    toast.success('Model disimpan ke Galeri 3D')
  } catch (e) {
    errorMsg.value = e?.message || 'Gagal menyimpan ke galeri'
  } finally {
    saving.value = false
  }
}

function onWizardComplete(payload) {
  Object.assign(form, payload)
  form.colors = { ...payload.colors }
  wizardDone.value = true
  runGenerate()
}

function restartWizard() {
  wizardDone.value = false
  result.value = null
  resultSignature.value = ''
  clearPreviews()
  const prevDispose = disposePrev
  disposePrev = null
  prevDispose?.()
}
const { downloadPlate, exportingPlate } = usePrintPlateExport(result, ensureFreshResult)

</script>

<template>
  <LightboxWizard v-if="!wizardDone" @complete="onWizardComplete" />

  <div class="h-full flex flex-col p-2 sm:p-3 min-h-0" :class="{ 'invisible pointer-events-none': !wizardDone }">
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
          <template v-if="activeToolPanel === 'design'">
            <button type="button" class="btn-secondary w-full text-sm" @click="restartWizard">
              <ArrowUturnLeftIcon class="w-4 h-4" />
              Setup ulang
            </button>
            <KeychainCompactField label="Label">
              <input v-model="form.label" class="input text-sm" maxlength="32" />
            </KeychainCompactField>
            <LightboxDesignPicker
              v-model:design-mode="form.designMode"
              v-model:text="form.text"
              v-model:font-url="form.fontUrl"
              v-model:svg-content="form.svgContent"
              v-model:image-data-url="form.imageDataUrl"
              v-model:max-size-mm="form.maxSizeMm"
              v-model:max-colors="form.maxColors"
              v-model:border-mm="form.borderMm"
            />
          </template>

          <template v-else-if="activeToolPanel === 'led'">
            <label class="flex items-center justify-between gap-3 rounded-lg border border-ink-100 p-2.5">
              <span class="min-w-0">
                <span class="block text-xs font-medium text-ink-800">Aksen LED strip</span>
                <span class="block text-[10px] text-ink-400">Preview hardware di cavity</span>
              </span>
              <input v-model="form.ledStripEnabled" type="checkbox" class="h-4 w-4 rounded border-ink-300 text-accent-600" @change="runGenerate" />
            </label>
            <div v-if="form.ledStripEnabled" class="grid grid-cols-[1fr_auto_auto] gap-2">
              <KeychainCompactField label="Lebar" unit="mm">
                <input v-model.number="form.ledStripWidthMm" type="number" min="2" max="8" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="PCB">
                <input v-model="form.ledStripColor" type="color" class="h-9 w-10 rounded-md border border-ink-200 cursor-pointer" @change="runGenerate" />
              </KeychainCompactField>
              <KeychainCompactField label="LED">
                <input v-model="form.ledLightColor" type="color" class="h-9 w-10 rounded-md border border-ink-200 cursor-pointer" @change="runGenerate" />
              </KeychainCompactField>
            </div>
            <label class="flex items-center justify-between gap-3 rounded-lg border border-ink-100 p-2.5">
              <span class="min-w-0">
                <span class="block text-xs font-medium text-ink-800">Diffuser</span>
                <span class="block text-[10px] text-ink-400">Solid layer di balik face</span>
              </span>
              <input v-model="form.diffuserEnabled" type="checkbox" class="h-4 w-4 rounded border-ink-300 text-accent-600" @change="runGenerate" />
            </label>
            <div v-if="form.diffuserEnabled" class="grid grid-cols-[1fr_auto] gap-2">
              <KeychainCompactField label="Tebal" unit="mm">
                <input v-model.number="form.diffuserDepthMm" type="number" min="0.2" max="2" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Warna">
                <input v-model="form.diffuserColor" type="color" class="h-9 w-10 rounded-md border border-ink-200 cursor-pointer" @change="runGenerate" />
              </KeychainCompactField>
            </div>
            <KeychainCompactField label="Cavity LED" unit="mm">
              <input v-model.number="form.backCavityDepthMm" type="number" min="8" max="30" step="1" class="input-num w-full text-sm" />
            </KeychainCompactField>
            <KeychainCompactField label="Back panel" unit="mm">
              <input v-model.number="form.backPanelMm" type="number" min="1" max="6" step="0.5" class="input-num w-full text-sm" />
            </KeychainCompactField>
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Lubang kabel" unit="mm">
                <input v-model.number="form.cableHoleMm" type="number" min="0" max="12" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Posisi">
                <select v-model="form.cableHoleSide" class="input text-sm">
                  <option value="bottom">Bawah</option>
                  <option value="left">Kiri</option>
                  <option value="right">Kanan</option>
                  <option value="back">Belakang</option>
                </select>
              </KeychainCompactField>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Gantung" unit="mm">
                <input v-model.number="form.hangingHoleMm" type="number" min="0" max="12" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Offset atas" unit="mm">
                <input v-model.number="form.hangingHoleOffsetMm" type="number" min="4" max="30" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Layer latar" unit="mm">
                <input v-model.number="form.backLayerDepthMm" type="number" min="0.4" max="3" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Layer warna" unit="mm">
                <input v-model.number="form.colorLayerDepthMm" type="number" min="0.3" max="1.5" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
          </template>

          <template v-else-if="activeToolPanel === 'stand'">
            <LightboxStandPicker
              v-model:stand-model-id="form.standModelId"
              v-model:stand-enabled="form.standEnabled"
              v-model:stand-width-mm="form.standWidthMm"
              v-model:stand-depth-mm="form.standDepthMm"
              v-model:stand-base-height-mm="form.standBaseHeightMm"
              v-model:stand-rail-height-mm="form.standRailHeightMm"
              v-model:stand-slot-mm="form.standSlotMm"
              v-model:stand-color="form.standColor"
            />
          </template>

          <template v-else-if="activeToolPanel === 'size'">
            <KeychainCompactField label="Border" unit="mm">
              <input
                v-model.number="form.borderMm"
                type="number"
                min="2"
                max="15"
                step="0.5"
                class="input-num w-full text-sm"
                :disabled="form.designMode === 'svg-qr'"
              />
            </KeychainCompactField>
            <p v-if="form.designMode === 'svg-qr'" class="text-[10px] text-ink-400 -mt-1">
              Mode QR memakai gap frame–QR tetap 2 mm di layout QR + ruang stand di bawah.
            </p>
            <KeychainCompactField label="Radius sudut" unit="mm">
              <input v-model.number="form.cornerRadiusMm" type="number" min="0" max="15" step="0.5" class="input-num w-full text-sm" />
            </KeychainCompactField>
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Lebar">
                <input v-model.number="form.outerWidthMm" type="number" min="60" max="200" step="1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Kedalaman">
                <input v-model.number="form.outerDepthMm" type="number" min="60" max="200" step="1" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <KeychainCompactField label="Dinding" unit="mm">
              <input v-model.number="form.wallThicknessMm" type="number" min="1.2" max="6" step="0.1" class="input-num w-full text-sm" />
            </KeychainCompactField>
          </template>

          <template v-else-if="activeToolPanel === 'colors'">
            <p class="text-xs text-ink-500">Hex manual atau pilih dari material di database.</p>
            <ToolColorBar
              v-model:mode="colorMode"
              v-model:colors="form.colors"
              v-model:material-ids="colorMaterialIds"
              :fields="COLOR_FIELDS"
              variant="list"
              @change="runGenerate"
            />
            <div v-if="editableLayerPalette.length" class="space-y-2 pt-2 border-t border-ink-100">
              <p class="text-xs font-medium text-ink-600">Layer gambar</p>
              <div class="grid grid-cols-1 gap-2">
                <label
                  v-for="layer in editableLayerPalette"
                  :key="`${layer.index}-${layer.name}`"
                  class="flex items-center gap-3 rounded-lg border border-ink-100 p-3 cursor-pointer hover:border-ink-200"
                >
                  <input
                    :value="layer.color"
                    type="color"
                    class="h-10 w-10 shrink-0 rounded-md border border-ink-200 cursor-pointer"
                    @change="updateLayerPaletteColor(layer, $event.target.value)"
                  />
                  <span class="min-w-0">
                    <span class="block text-xs font-medium text-ink-800">{{ layer.name }}</span>
                    <span class="block text-[10px] font-mono text-ink-400">{{ layer.color }}</span>
                  </span>
                </label>
              </div>
            </div>
          </template>

          <template v-else-if="activeToolPanel === 'info'">
            <p class="text-[11px] text-ink-500">
              Terinspirasi <strong>MakerWorld Lightbox Maker</strong> — face multi-layer + cavity LED di belakang.
            </p>
            <p v-if="form.standEnabled" class="text-[11px] text-ink-500">
              Stand: <strong>{{ activeStandPreset.label }}</strong> — {{ activeStandPreset.description }}
            </p>
            <dl v-if="result" class="space-y-1 text-[11px] font-mono text-ink-600">
              <div class="flex justify-between"><dt class="text-ink-400">Layer</dt><dd>{{ result.dimensions.layerCount }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Face depth</dt><dd>{{ result.dimensions.faceDepthMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Cavity</dt><dd>{{ result.dimensions.cavityDepthMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Desain</dt><dd>{{ result.dimensions.designWidthMm }}×{{ result.dimensions.designHeightMm }} mm</dd></div>
              <div v-if="result.dimensions.standWidthMm" class="flex justify-between"><dt class="text-ink-400">Stand</dt><dd>{{ result.dimensions.standWidthMm }}×{{ result.dimensions.standDepthMm }}×{{ result.dimensions.standHeightMm }} mm</dd></div>
              <div v-if="result.dimensions.standSlotMm" class="flex justify-between"><dt class="text-ink-400">Slot stand</dt><dd>{{ result.dimensions.standSlotMm }} mm</dd></div>
            </dl>
          </template>

          <template v-else-if="activeToolPanel === 'export'">
            <template v-if="result">
            <KeychainCompactField label="Format">
              <select v-model="exportFormat" class="input text-sm">
                <option v-for="f in exportFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
              </select>
            </KeychainCompactField>
              <PrintPlateExport v-if="exportFormat === '3mf'" :busy="exportingPlate" @download="downloadPlate" />
            <div class="space-y-2">
              <button v-if="exportFormat === 'glb'" type="button" class="btn-secondary w-full text-sm" @click="downloadPart('assembly')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Assembly (GLB)
              </button>
              <button type="button" class="btn-secondary w-full text-sm" @click="downloadPart('face')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Front & Side
              </button>
              <button type="button" class="btn-secondary w-full text-sm" @click="downloadPart('body')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Back
              </button>
              <button v-if="result.standPreviewParts?.length" type="button" class="btn-secondary w-full text-sm" @click="downloadPart('stand')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Stand
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
            </template>
          </template>

          <p v-if="errorMsg" class="text-xs text-red-600">{{ errorMsg }}</p>
      </ToolPanelShell>

      <div :class="[layoutConfig.previewOrder, layoutConfig.previewClass]">
        <div class="shrink-0 border-b border-ink-200 bg-white px-3 py-2 space-y-2">
          <div v-if="result" class="hidden lg:flex items-center gap-3 text-[10px] font-mono text-ink-500">
            <span>{{ result.dimensions.widthMm }}×{{ result.dimensions.depthMm }}×{{ result.dimensions.heightMm }} mm</span>
            <span class="text-ink-300">|</span>
            <span>{{ result.dimensions.layerCount }} layer</span>
          </div>
          <p v-if="result" class="text-[10px] text-ink-400">
            {{ deviceLabel }} · mode {{ modeLabel }} · legend preview dapat dipindah & minimize
          </p>
        </div>

        <div class="relative flex-1 min-h-[18rem] sm:min-h-[24rem] bg-gradient-to-b from-ink-50 to-ink-100/80">
          <ClientOnly>
            <template v-if="activePreviewParts.length">
              <KeychainPreview
                :key="`${activePreview}-${previewKey}`"
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
              <ArrowPathIcon class="w-6 h-6 animate-spin text-amber-500" />
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
