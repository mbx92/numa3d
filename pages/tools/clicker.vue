<script setup>
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  CloudArrowUpIcon,
  CursorArrowRaysIcon,
  ArrowsPointingInIcon,
  Square3Stack3DIcon,
  PaintBrushIcon,
  DocumentArrowDownIcon,
  PencilSquareIcon
} from '@heroicons/vue/24/outline'
import { CLICKER_DEFAULTS } from '~/utils/clickerPresets.js'
import { EXPORT_FORMATS, exportFilename, exportMime } from '~/utils/keychainExport.js'
import { generateClicker } from '~/utils/clickerGenerator.js'
import { downloadBlob } from '~/utils/downloadBlob.js'
import { getSwitchPreset } from '~/utils/clickerPresets.js'
import { useUiLayout } from '~/composables/useUiLayout.js'
import { useToolColorMode } from '~/composables/useToolColorMode.js'
import ToolColorBar from '~/components/ToolColorBar.vue'
import ToolPanelShell from '~/components/ToolPanelShell.vue'
import PreviewViewLegend from '~/components/PreviewViewLegend.vue'
import { buildPartLegend } from '~/utils/previewPartLabels.js'

definePageMeta({
  layout: 'tool',
  toolTitle: 'Clicker Generator',
  toolFullBleed: true
})

const SwitchPanelIcon = markRaw(CursorArrowRaysIcon)

const { layoutConfig, deviceLabel, modeLabel } = useUiLayout()

const COLOR_FIELDS = [
  { key: 'base', label: 'Base', short: 'Base', materialType: 'filament' },
  { key: 'lid', label: 'Lid', short: 'Lid', materialType: 'filament' },
  { key: 'text', label: 'Text / artwork', short: 'Text', materialType: 'filament' }
]

const { mode: colorMode } = useToolColorMode()
const colorMaterialIds = ref({})

const exportFormats = EXPORT_FORMATS
const form = reactive({
  ...CLICKER_DEFAULTS,
  colors: { ...CLICKER_DEFAULTS.colors }
})

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()
const exportFormat = ref('3mf')
const activePreset = computed(() => getSwitchPreset(form.switchPresetId))

const activeToolPanel = ref('design')

const TOOL_PANELS = [
  { id: 'design', label: 'Desain', icon: markRaw(PencilSquareIcon) },
  { id: 'switch', label: 'Switch', icon: SwitchPanelIcon },
  { id: 'size', label: 'Ukuran', icon: markRaw(ArrowsPointingInIcon) },
  { id: 'colors', label: 'Warna', icon: markRaw(PaintBrushIcon) },
  { id: 'base', label: 'Info', icon: markRaw(Square3Stack3DIcon) },
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

const wizardDone = ref(false)
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
const simulatingClick = ref(false)
const basePreviewParts = ref([])
const lidPreviewParts = ref([])
const assemblyPreviewParts = ref([])

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
  const travel = Number(form.travelMm) || CLICKER_DEFAULTS.travelMm
  const proud = Number(form.capProudMm) || CLICKER_DEFAULTS.capProudMm
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
  const token = ++generateToken
  generating.value = true
  const prevDispose = disposePrev
  disposePrev = null
  clearPreviews()
  previewKey.value += 1
  await nextTick()
  prevDispose?.()
  try {
    const out = await generateClicker({ ...form, colors: { ...form.colors } })
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
  } catch (e) {
    if (token !== generateToken) return
    result.value = null
    toast.error(e?.message || 'Gagal membuat model clicker')
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
      toast.error('Part lid tidak tersedia')
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

function onWizardComplete(payload) {
  Object.assign(form, payload)
  form.colors = { ...payload.colors }
  wizardDone.value = true
  runGenerate()
}

function restartWizard() {
  wizardDone.value = false
  result.value = null
  simulatingClick.value = false
  clearPreviews()
  const prevDispose = disposePrev
  disposePrev = null
  prevDispose?.()
}

watch(canSimulateClick, (ok) => {
  if (!ok) simulatingClick.value = false
})
const { downloadPlate, exportingPlate } = usePrintPlateExport(result)

</script>

<template>
  <ClickerWizard v-if="!wizardDone" @complete="onWizardComplete" />

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
            <ClickerDesignPicker
              v-model:shape-mode="form.shapeMode"
              v-model:base-shape="form.baseShape"
              v-model:per-letter-shapes="form.perLetterShapes"
              v-model:letter-shapes="form.letterShapes"
              v-model:flexi-enabled="form.flexiEnabled"
              v-model:flexi-connection-style="form.flexiConnectionStyle"
              v-model:flexi-clearance-mm="form.flexiClearanceMm"
              v-model:flexi-strap-hole-mm="form.flexiStrapHoleMm"
              v-model:text="form.text"
              v-model:font-url="form.fontUrl"
              v-model:svg-content="form.svgContent"
              v-model:mesh-buffer="form.meshBuffer"
              v-model:mesh-filename="form.meshFilename"
              v-model:mesh-library-file-id="form.meshLibraryFileId"
              v-model:mesh-relief-height-mm="form.meshReliefHeightMm"
              v-model:max-size-mm="form.maxSizeMm"
              v-model:display-mode="form.displayMode"
              v-model:snap-fit-enabled="form.snapFitEnabled"
              v-model:keyring-enabled="form.keyringEnabled"
              v-model:keyring-style="form.keyringStyle"
              v-model:keyring-hole-mm="form.keyringHoleMm"
              v-model:keyring-angle-deg="form.keyringAngleDeg"
            />
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
              <input v-model.number="form.fitToleranceMm" type="number" min="0" max="0.5" step="0.02" class="input-num w-full text-sm" />
            </KeychainCompactField>
          </template>

          <template v-else-if="activeToolPanel === 'size'">
            <KeychainCompactField v-if="form.shapeMode === 'rect'" label="Lebar base">
              <input v-model.number="form.outerWidthMm" type="number" min="24" max="80" step="0.5" class="input-num w-full text-sm" />
            </KeychainCompactField>
            <p v-else class="text-[10px] text-ink-400">Base otomatis dari bentuk lid ({{ form.maxSizeMm }} mm max).</p>
            <KeychainCompactField label="Tinggi lid">
              <input v-model.number="form.lidHeightMm" type="number" min="6" max="20" step="0.5" class="input-num w-full text-sm" />
            </KeychainCompactField>
            <div class="grid grid-cols-3 gap-2">
              <KeychainCompactField label="Lebar">
                <input v-model.number="form.outerWidthMm" type="number" min="24" max="80" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Kedalaman">
                <input v-model.number="form.outerDepthMm" type="number" min="24" max="80" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Tinggi">
                <input v-model.number="form.outerHeightMm" type="number" min="12" max="50" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <KeychainCompactField label="Lantai">
                <input v-model.number="form.floorThicknessMm" type="number" min="1" max="6" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Rim atas">
                <input v-model.number="form.topRimMm" type="number" min="1" max="8" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Dinding">
                <input v-model.number="form.wallThicknessMm" type="number" min="1.5" max="8" step="0.1" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <KeychainCompactField label="Cap proud (travel)">
              <input v-model.number="form.capProudMm" type="number" min="0.4" max="6" step="0.2" class="input-num w-full text-sm" />
            </KeychainCompactField>
            <p class="text-[10px] text-ink-400 font-mono">
              Plate {{ result?.dimensions?.plateWidthMm || '—' }}×{{ result?.dimensions?.plateDepthMm || '—' }} mm ·
              Well {{ result?.dimensions?.wellWidthMm || '—' }} mm ·
              Pocket {{ activePreset.housingOuterMm + form.fitToleranceMm * 2 }} mm
            </p>
          </template>

          <template v-else-if="activeToolPanel === 'colors'">
            <p class="text-xs text-ink-500">Material dari stok, 1 warna abu-abu, atau hex.</p>
            <ToolColorBar
              v-model:mode="colorMode"
              v-model:colors="form.colors"
              v-model:material-ids="colorMaterialIds"
              :fields="COLOR_FIELDS"
              variant="list"
              @change="runGenerate"
            />
          </template>

          <template v-else-if="activeToolPanel === 'base'">
            <p class="text-[11px] text-ink-500">Preset: <strong>{{ activePreset.name }}</strong></p>
            <dl class="space-y-1 text-[11px] font-mono text-ink-600">
              <div class="flex justify-between"><dt class="text-ink-400">Housing</dt><dd>{{ activePreset.housingOuterMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Plate cutout</dt><dd>{{ activePreset.plateCutoutMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Body depth</dt><dd>{{ activePreset.bodyDepthMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Stem boss</dt><dd>{{ activePreset.stemBossMm }} mm</dd></div>
              <div v-if="result" class="flex justify-between"><dt class="text-ink-400">Body</dt><dd>{{ result.dimensions.widthMm }}×{{ result.dimensions.depthMm }} mm</dd></div>
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
              <GeneratorHppPanel
                :result="result"
                :color-fields="COLOR_FIELDS"
                :material-ids="colorMaterialIds"
                :colors="form.colors"
                :color-mode="colorMode"
              />
            </template>
            <p v-else class="text-xs text-ink-500 text-center py-8">Generate model dulu untuk export.</p>
          </template>
      </ToolPanelShell>

      <div :class="[layoutConfig.previewOrder, layoutConfig.previewClass]">
        <div class="sticky top-0 z-10 shrink-0 border-b border-ink-200 bg-white/95 backdrop-blur-sm shadow-sm px-3 py-2 space-y-2">
          <div v-if="result" class="hidden lg:flex items-center gap-3 text-[10px] font-mono text-ink-500">
            <span>{{ result.dimensions.widthMm }}×{{ result.dimensions.depthMm }}×{{ result.dimensions.heightMm }} mm</span>
            <span class="text-ink-300">|</span>
            <span>Pocket {{ result.dimensions.housingPocketMm }} mm</span>
            <span class="text-ink-300">|</span>
            <span>±{{ result.dimensions.fitToleranceMm }} tol</span>
          </div>
          <p v-if="result" class="text-[10px] text-ink-400">
            {{ deviceLabel }} · mode {{ modeLabel }} · legend preview dapat dipindah & minimize
          </p>
          <p v-if="result?.warnings?.length" class="text-[10px] text-amber-700">
            {{ result.warnings[0] }}
          </p>
        </div>

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
                :simulate-click="simulatingClick && canSimulateClick"
                :interactive-click="canSimulateClick"
                :interactive-assembly="isAssemblyView"
                :explode-factor="explodeFactor"
                :auto-explode="autoExplode"
                click-role="lid"
                :click-travel-mm="clickTravelMm"
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
                      :title="canSimulateClick ? `Travel ${clickTravelMm} mm` : 'Simulasi tersedia di Perakitan, selain mode Print'"
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
