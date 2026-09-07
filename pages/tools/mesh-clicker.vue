<script setup>
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CloudArrowUpIcon,
  CubeTransparentIcon,
  CursorArrowRaysIcon,
  ArrowsPointingInIcon,
  Square3Stack3DIcon,
  PaintBrushIcon,
  DocumentArrowDownIcon
} from '@heroicons/vue/24/outline'
import { markRaw } from 'vue'
import { useUiLayout } from '~/composables/useUiLayout.js'
import { useToolColorMode } from '~/composables/useToolColorMode.js'
import { useToast } from '~/composables/useToast.js'
import { MESH_CLICKER_DEFAULTS, getSwitchPreset } from '~/utils/clickerPresets.js'
import { EXPORT_FORMATS, exportFilename, exportMime } from '~/utils/keychainExport.js'
import { generateClicker } from '~/utils/clickerGenerator.js'
import { downloadBlob } from '~/utils/downloadBlob.js'
import ToolColorBar from '~/components/ToolColorBar.vue'
import ToolPanelShell from '~/components/ToolPanelShell.vue'
import PreviewViewLegend from '~/components/PreviewViewLegend.vue'
import { buildPartLegend } from '~/utils/previewPartLabels.js'

definePageMeta({
  layout: 'tool',
  toolTitle: 'Mesh → Clicker',
  toolFullBleed: true
})

const SwitchPanelIcon = markRaw(CursorArrowRaysIcon)
const MeshToolIcon = markRaw(CubeTransparentIcon)

const { layoutConfig, deviceLabel, modeLabel } = useUiLayout()
const route = useRoute()

const COLOR_FIELDS = [
  { key: 'base', label: 'Base (bawah)', short: 'Base', materialType: 'filament' },
  { key: 'lid', label: 'Lid (atas)', short: 'Lid', materialType: 'filament' }
]

const { mode: colorMode } = useToolColorMode()
const colorMaterialIds = ref({})

const exportFormats = EXPORT_FORMATS
const form = reactive({
  ...MESH_CLICKER_DEFAULTS,
  colors: { ...MESH_CLICKER_DEFAULTS.colors },
  meshSplitRegion: { ...MESH_CLICKER_DEFAULTS.meshSplitRegion }
})

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()
const exportFormat = ref('3mf')
const activePreset = computed(() => getSwitchPreset(form.switchPresetId))
const autoLibraryId = computed(() => {
  const raw = route.query.libraryFileId
  const id = Array.isArray(raw) ? raw[0] : raw
  return Number(id || 0) || null
})

const activeToolPanel = ref('design')

const TOOL_PANELS = [
  { id: 'design', label: 'Mesh', icon: MeshToolIcon },
  { id: 'switch', label: 'Switch', icon: SwitchPanelIcon },
  { id: 'size', label: 'Ukuran', icon: markRaw(ArrowsPointingInIcon) },
  { id: 'colors', label: 'Warna', icon: markRaw(PaintBrushIcon) },
  { id: 'info', label: 'Info', icon: markRaw(Square3Stack3DIcon) },
  { id: 'export', label: 'Export', icon: markRaw(DocumentArrowDownIcon), needsResult: true }
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

const generating = ref(false)
const saving = ref(false)
const result = ref(null)
const previewKey = ref(0)
const activePreview = ref('assembly')
/** cut = atur bidang potong mesh; result = preview hasil generate */
const previewStage = ref('cut')
const selectedPartId = ref('')
const explodeFactor = ref(0)
const autoExplode = ref(false)
const showPreviewGrid = ref(true)
const assemblyResetToken = ref(0)
const simulatingClick = ref(false)
const basePreviewParts = ref([])
const lidPreviewParts = ref([])
const assemblyPreviewParts = ref([])

const hasMeshSource = computed(() => {
  if (form.meshSourceMode === 'parts') {
    return form.meshLidBuffer instanceof ArrayBuffer && form.meshBaseBuffer instanceof ArrayBuffer
  }
  return form.meshBuffer instanceof ArrayBuffer
})

const showCutPreview = computed(
  () => hasMeshSource.value && form.meshSourceMode !== 'parts' && previewStage.value === 'cut'
)

watch(
  () => form.meshBuffer,
  (buf) => {
    if (buf instanceof ArrayBuffer) {
      if (!result.value) previewStage.value = 'cut'
    } else {
      previewStage.value = 'cut'
    }
  }
)

const activePreviewParts = computed(() => {
  if (activePreview.value === 'base') return basePreviewParts.value
  if (activePreview.value === 'lid') return lidPreviewParts.value
  return assemblyPreviewParts.value
})

const previewTabs = computed(() => [
  { id: 'assembly', label: 'Perakitan', colors: [form.colors.base, form.colors.lid] },
  { id: 'base', label: 'Base', color: form.colors.base },
  { id: 'lid', label: 'Lid', color: form.colors.lid }
])

const assemblyPartLegend = computed(() => buildPartLegend(assemblyPreviewParts.value))
const isAssemblyView = computed(() => activePreview.value === 'assembly')

function resetAssemblyPreview() {
  explodeFactor.value = 0
  autoExplode.value = false
  selectedPartId.value = ''
  assemblyResetToken.value++
}

const canSimulateClick = computed(
  () => Boolean(result.value) && activePreview.value === 'assembly' && form.displayMode !== 'print'
)

const clickTravelMm = computed(() => {
  const travel = Number(form.travelMm) || MESH_CLICKER_DEFAULTS.travelMm
  const proud = Number(form.capProudMm) || MESH_CLICKER_DEFAULTS.capProudMm
  return Number(Math.max(0.2, Math.min(travel, proud * 0.85)).toFixed(2))
})

const activePreviewFilename = computed(() => {
  if (activePreview.value === 'base') return result.value?.baseFilename
  if (activePreview.value === 'lid') return result.value?.lidFilename || result.value?.accentFilename
  return `${result.value?.baseFilename} + lid`
})

let disposePrev = null
let generateToken = 0

function clearPreviews() {
  basePreviewParts.value = []
  lidPreviewParts.value = []
  assemblyPreviewParts.value = []
}

onUnmounted(() => {
  clearPreviews()
  disposePrev?.()
})

async function runGenerate() {
  const dual =
    form.meshSourceMode === 'parts' &&
    form.meshLidBuffer instanceof ArrayBuffer &&
    form.meshBaseBuffer instanceof ArrayBuffer
  if (form.meshSourceMode === 'parts' && !dual) {
    toast.error('Upload lid + base (.3mf/.stl) dulu')
    activeToolPanel.value = 'design'
    return
  }
  if (!dual && !(form.meshBuffer instanceof ArrayBuffer)) {
    toast.error('Pilih atau upload mesh .3mf/.stl dulu')
    activeToolPanel.value = 'design'
    return
  }
  const token = ++generateToken
  generating.value = true
  previewStage.value = 'result'
  const prevDispose = disposePrev
  disposePrev = null
  clearPreviews()
  previewKey.value += 1
  await nextTick()
  prevDispose?.()
  try {
    const out = await generateClicker({
      ...form,
      shapeMode: 'mesh',
      baseShape: 'outline',
      meshUpAxis: form.meshUpAxis || 'auto',
      meshSplitLidRatio: dual
        ? 0
        : Number(form.meshSplitLidRatio) || MESH_CLICKER_DEFAULTS.meshSplitLidRatio,
      meshSplitRegion: { ...(form.meshSplitRegion || MESH_CLICKER_DEFAULTS.meshSplitRegion) },
      meshStemBuryMm: Number(form.meshStemBuryMm) || MESH_CLICKER_DEFAULTS.meshStemBuryMm,
      meshLidBuffer: dual ? form.meshLidBuffer.slice(0) : null,
      meshBaseBuffer: dual ? form.meshBaseBuffer.slice(0) : null,
      meshLidFilename: dual ? form.meshLidFilename : '',
      meshBaseFilename: dual ? form.meshBaseFilename : '',
      meshBuffer: dual ? form.meshBaseBuffer.slice(0) : form.meshBuffer.slice(0),
      meshFilename: dual ? form.meshBaseFilename : form.meshFilename,
      colors: { ...form.colors, text: form.colors.lid }
    })
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
      line: p.line,
      role: p.role
    }))
    lidPreviewParts.value = (out.lidPreviewParts || out.accentPreviewParts).map((p) => ({
      geometry: p.geometry,
      color: p.color,
      line: p.line,
      role: p.role
    }))
    assemblyPreviewParts.value = out.assemblyPreviewParts.map((p) => ({
      geometry: p.geometry,
      modelUrl: p.modelUrl,
      modelNodeNames: p.modelNodeNames,
      modelFitMm: p.modelFitMm,
      modelTopZ: p.modelTopZ,
      modelAxis: p.modelAxis,
      position: p.position,
      rotationZ: p.rotationZ,
      color: p.color,
      line: p.line,
      role: p.role,
      name: p.name,
      opacity: p.opacity
    }))
    selectedPartId.value = ''
    explodeFactor.value = 0
    autoExplode.value = false
    if (out.warnings?.length) toast.info(out.warnings[0])
  } catch (e) {
    if (token !== generateToken) return
    result.value = null
    previewStage.value = 'cut'
    toast.error(e?.message || 'Gagal membuat mesh clicker')
  } finally {
    if (token === generateToken) generating.value = false
  }
}

async function resolvePartExport(part) {
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
  } else if (part === 'lid' || part === 'accent') {
    if (fmt === '3mf') {
      blob = result.value.getLid3mfBlob?.() || result.value.getAccent3mfBlob()
      filename = exportFilename(slug, 'text', fmt)
    } else if (fmt === 'glb') {
      blob = await (result.value.getLidGlbBlob?.() || result.value.getAccentGlbBlob())
      filename = exportFilename(slug, 'text', fmt)
    } else if (fmt === 'stl-parts') {
      blob = result.value.getLidMultiStlBlob?.() || result.value.getAccentMultiStlBlob()
      filename = exportFilename(slug, 'text', fmt)
    } else if (fmt === 'stl-color') {
      blob = result.value.getLidColoredStlBlob?.() || result.value.getAccentColoredStlBlob()
      filename = exportFilename(slug, 'text', fmt)
    } else {
      blob = result.value.getLidBlob?.() || result.value.getAccentBlob()
      filename = result.value.lidFilename || result.value.accentFilename
    }
  }
  return { blob, filename }
}

async function downloadPart(part) {
  try {
    const resolved = await resolvePartExport(part)
    const blob = resolved?.blob
    const filename = resolved?.filename
    if (!blob) {
      toast.error('Part tidak tersedia')
      return
    }
    downloadBlob(blob, filename)
    const fmtLabel = exportFormats.find((f) => f.id === exportFormat.value)?.label || exportFormat.value
    toast.success(`Unduh ${part === 'base' ? 'base' : 'lid'} (${fmtLabel})`)
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
  if (!result.value || !isAdmin.value) return
  saving.value = true
  try {
    const base = await resolvePartExport('base')
    const lid = await resolvePartExport('lid')
    if (!base?.blob) throw new Error('Part base tidak tersedia')
    await uploadBlob(base.blob, base.filename)
    if (lid?.blob) await uploadBlob(lid.blob, lid.filename)
    const fmtLabel = exportFormats.find((f) => f.id === exportFormat.value)?.label || exportFormat.value
    toast.success(`Model disimpan ke Galeri 3D (${fmtLabel})`)
  } catch (e) {
    toast.error(e?.message || 'Gagal menyimpan ke galeri')
  } finally {
    saving.value = false
  }
}

watch(canSimulateClick, (ok) => {
  if (!ok) simulatingClick.value = false
})

function onMeshLoaded({ filename }) {
  if (!form.label || form.label === MESH_CLICKER_DEFAULTS.label) {
    const base = String(filename || '')
      .replace(/\.(3mf|stl)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()
    if (base) form.label = base.slice(0, 32)
  }
}

const meshSourceRef = ref(null)

function onAutoDetectFromPreview() {
  meshSourceRef.value?.runAutoDetect?.()
}

watch(
  () => form.meshSourceMode,
  (mode) => {
    if (mode === 'parts') previewStage.value = result.value ? 'result' : 'cut'
  }
)
const { downloadPlate, exportingPlate } = usePrintPlateExport(result)

</script>

<template>
  <div class="h-full flex flex-col p-2 sm:p-3 min-h-0">
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
          <KeychainCompactField label="Label" unit="">
            <input v-model="form.label" class="input text-sm" maxlength="32" />
          </KeychainCompactField>
          <ClickerMeshSource
            ref="meshSourceRef"
            v-model:mesh-buffer="form.meshBuffer"
            v-model:mesh-filename="form.meshFilename"
            v-model:mesh-library-file-id="form.meshLibraryFileId"
            v-model:mesh-relief-height-mm="form.meshReliefHeightMm"
            v-model:mesh-split-lid-ratio="form.meshSplitLidRatio"
            v-model:mesh-split-region="form.meshSplitRegion"
            v-model:mesh-stem-bury-mm="form.meshStemBuryMm"
            v-model:mesh-up-axis="form.meshUpAxis"
            v-model:mesh-source-mode="form.meshSourceMode"
            v-model:mesh-lid-buffer="form.meshLidBuffer"
            v-model:mesh-lid-filename="form.meshLidFilename"
            v-model:mesh-base-buffer="form.meshBaseBuffer"
            v-model:mesh-base-filename="form.meshBaseFilename"
            v-model:max-size-mm="form.maxSizeMm"
            v-model:display-mode="form.displayMode"
            v-model:keyring-enabled="form.keyringEnabled"
            v-model:keyring-angle-deg="form.keyringAngleDeg"
            :auto-select-id="autoLibraryId"
            @loaded="onMeshLoaded"
          />
          <NuxtLink to="/gallery" class="text-[11px] text-accent-600 hover:text-accent-700">
            Buka Galeri 3D →
          </NuxtLink>
        </template>

        <template v-else-if="activeToolPanel === 'switch'">
          <ClickerSwitchPicker
            v-model="form.switchPresetId"
            v-model:switch-preview-model-id="form.switchPreviewModelId"
            v-model:stem-fit-pct="form.stemFitPct"
            v-model:socket-fit-pct="form.socketFitPct"
            v-model:slip-tolerance-mm="form.slipToleranceMm"
          />
          <KeychainCompactField label="Toleransi pocket" unit="mm">
            <input
              v-model.number="form.fitToleranceMm"
              type="number"
              min="0"
              max="0.5"
              step="0.02"
              class="input-num w-full text-sm"
            />
          </KeychainCompactField>
        </template>

        <template v-else-if="activeToolPanel === 'size'">
          <KeychainCompactField label="Cap proud (travel)">
            <input
              v-model.number="form.capProudMm"
              type="number"
              min="0.4"
              max="6"
              step="0.2"
              class="input-num w-full text-sm"
            />
          </KeychainCompactField>
          <KeychainCompactField label="Travel switch">
            <input
              v-model.number="form.travelMm"
              type="number"
              min="1"
              max="6"
              step="0.2"
              class="input-num w-full text-sm"
            />
          </KeychainCompactField>
          <KeychainCompactField label="Ketebalan lantai">
            <input
              v-model.number="form.floorThicknessMm"
              type="number"
              min="1"
              max="6"
              step="0.1"
              class="input-num w-full text-sm"
            />
          </KeychainCompactField>
          <p class="text-[10px] text-ink-400">
            Ukuran XY & tinggi mesh diatur di panel Mesh. Base mengikuti siluet convex hull model.
          </p>
        </template>

        <template v-else-if="activeToolPanel === 'colors'">
          <ToolColorBar
            v-model:mode="colorMode"
            v-model:colors="form.colors"
            v-model:material-ids="colorMaterialIds"
            :fields="COLOR_FIELDS"
            variant="list"
            @change="runGenerate"
          />
        </template>

        <template v-else-if="activeToolPanel === 'info'">
          <p class="text-[11px] text-ink-500">
            Preset: <strong>{{ activePreset.name }}</strong>
          </p>
          <dl class="space-y-1 text-[11px] font-mono text-ink-600">
            <div class="flex justify-between">
              <dt class="text-ink-400">Housing</dt>
              <dd>{{ activePreset.housingOuterMm }} mm</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-400">Lid ratio</dt>
              <dd>{{ Math.round((form.meshSplitLidRatio || 0) * 100) }}%</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-400">File</dt>
              <dd class="truncate max-w-[10rem]" :title="form.meshFilename">
                {{ form.meshFilename || '—' }}
              </dd>
            </div>
            <div v-if="result" class="flex justify-between">
              <dt class="text-ink-400">Body</dt>
              <dd>{{ result.dimensions.widthMm }}×{{ result.dimensions.depthMm }} mm</dd>
            </div>
          </dl>
          <p class="text-[10px] text-ink-400 leading-relaxed pt-2">
            Orientasi model: sumbu Z harus ke atas (roti atas di +Z). Jika terbalik, putar di CAD lalu
            upload ulang.
          </p>
        </template>

        <template v-else-if="activeToolPanel === 'export'">
          <template v-if="result">
            <KeychainCompactField label="Format">
              <select v-model="exportFormat" class="input text-sm">
                <option v-for="f in exportFormats" :key="f.id" :value="f.id">{{ f.label }}</option>
              </select>
            </KeychainCompactField>
              <PrintPlateExport v-if="exportFormat === '3mf'" :busy="exportingPlate" mesh @download="downloadPlate" />
            <div class="space-y-2">
              <button type="button" class="btn-secondary w-full text-sm" @click="downloadPart('base')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Base
              </button>
              <button type="button" class="btn-secondary w-full text-sm" @click="downloadPart('lid')">
                <ArrowDownTrayIcon class="w-4 h-4" /> Lid
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
          <p v-else class="text-xs text-ink-500 text-center py-8">Generate model dulu untuk export.</p>
        </template>
      </ToolPanelShell>

      <div :class="[layoutConfig.previewOrder, layoutConfig.previewClass]">
        <div
          class="sticky top-0 z-10 shrink-0 border-b border-ink-200 bg-white/95 backdrop-blur-sm shadow-sm px-3 py-2 space-y-2"
        >
          <div class="flex flex-wrap items-center gap-2">
            <div
              v-if="hasMeshSource && form.meshSourceMode !== 'parts'"
              class="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5 text-[11px]"
            >
              <button
                type="button"
                class="rounded-md px-2.5 py-1 transition-colors"
                :class="
                  previewStage === 'cut'
                    ? 'bg-white text-ink-800 shadow-sm'
                    : 'text-ink-500 hover:text-ink-700'
                "
                @click="previewStage = 'cut'"
              >
                Potongan
              </button>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 transition-colors disabled:opacity-40"
                :class="
                  previewStage === 'result'
                    ? 'bg-white text-ink-800 shadow-sm'
                    : 'text-ink-500 hover:text-ink-700'
                "
                :disabled="!result"
                title="Generate dulu untuk melihat hasil clicker"
                @click="previewStage = 'result'"
              >
                Hasil
              </button>
            </div>
            <div
              v-if="result && previewStage === 'result'"
              class="hidden lg:flex items-center gap-3 text-[10px] font-mono text-ink-500"
            >
              <span
                >{{ result.dimensions.widthMm }}×{{ result.dimensions.depthMm }}×{{
                  result.dimensions.heightMm
                }}
                mm</span
              >
              <span class="text-ink-300">|</span>
              <span>split {{ Math.round((form.meshSplitLidRatio || 0) * 100) }}% lid</span>
            </div>
          </div>
          <p v-if="result && previewStage === 'result'" class="text-[10px] text-ink-400">
            {{ deviceLabel }} · mode {{ modeLabel }} · Mesh → Clicker
          </p>
          <p v-else-if="hasMeshSource && previewStage === 'cut'" class="text-[10px] text-ink-400">
            Seret bidang biru di preview atau slider — lid = bagian atas mesh
          </p>
          <p v-if="result?.warnings?.length && previewStage === 'result'" class="text-[10px] text-amber-700">
            {{ result.warnings[0] }}
          </p>
        </div>

        <div
          class="relative flex-1 min-h-[18rem] sm:min-h-[24rem] bg-gradient-to-b from-ink-50 to-ink-100/80 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:24px_24px]"
        >
          <ClientOnly>
            <ClickerMeshCutPreview
              v-if="showCutPreview"
              :key="`cut-${form.meshFilename}-${form.maxSizeMm}-${form.meshUpAxis}`"
              v-model:split-lid-ratio="form.meshSplitLidRatio"
              v-model:split-region="form.meshSplitRegion"
              :mesh-buffer="form.meshBuffer"
              :mesh-filename="form.meshFilename"
              :max-size-mm="form.maxSizeMm"
              :lid-color="form.colors.lid"
              :base-color="form.colors.base"
              :up-axis="form.meshUpAxis"
              @auto-detect="onAutoDetectFromPreview"
            />
            <template v-else-if="previewStage === 'result' && activePreviewParts.length">
              <KeychainPreview
                :key="`${activePreview}-${previewKey}`"
                v-model:selected-part-id="selectedPartId"
                :parts="activePreviewParts"
                :show-grid="showPreviewGrid"
                :assembly-reset-token="assemblyResetToken"
                :simulate-click="simulatingClick && canSimulateClick"
                :interactive-click="canSimulateClick"
                :interactive-assembly="isAssemblyView"
                :explode-factor="explodeFactor"
                :auto-explode="autoExplode"
                click-role="lid"
                :click-travel-mm="clickTravelMm"
                z-up-model
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
              >
                <template #footer>
                  <div class="pointer-events-auto flex justify-end">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-md backdrop-blur-md transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      :class="
                        simulatingClick
                          ? 'border-accent-500 bg-accent-50/95 text-accent-700'
                          : 'border-ink-200 bg-white/92 text-ink-600 hover:bg-ink-50'
                      "
                      :disabled="!canSimulateClick"
                      :title="canSimulateClick ? `Travel ${clickTravelMm} mm` : 'Simulasi di Perakitan'"
                      @click="simulatingClick = !simulatingClick"
                    >
                      <component :is="SwitchPanelIcon" class="w-3.5 h-3.5" />
                      {{ simulatingClick ? 'Stop klik' : 'Simulasi klik' }}
                    </button>
                  </div>
                </template>
              </PreviewViewLegend>
            </template>
            <div
              v-else-if="generating"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-ink-500"
            >
              <ArrowPathIcon class="w-6 h-6 animate-spin text-accent-500" />
              Memotong mesh & memasang switch…
            </div>
            <div
              v-else
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-ink-400 px-6 text-center"
            >
              <component :is="MeshToolIcon" class="w-8 h-8 text-ink-300" />
              <p>Pilih mesh · atur potongan / dua file · Generate</p>
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
