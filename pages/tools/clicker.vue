<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'Clicker Generator',
  toolFullBleed: true
})

import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
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
import { generateClicker, downloadBlob } from '~/utils/clickerGenerator.js'
import { getSwitchPreset } from '~/utils/clickerPresets.js'

const COLOR_FIELDS = [
  { key: 'base', label: 'Base', short: 'Base' },
  { key: 'lid', label: 'Lid', short: 'Lid' }
]

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
const toolPanels = computed(() => {
  const panels = [
    { id: 'design', label: 'Desain', icon: PencilSquareIcon },
    { id: 'switch', label: 'Switch', icon: CursorArrowRaysIcon },
    { id: 'size', label: 'Ukuran', icon: ArrowsPointingInIcon },
    { id: 'base', label: 'Info', icon: Square3Stack3DIcon }
  ]
  if (result.value) panels.push({ id: 'export', label: 'Export', icon: DocumentArrowDownIcon })
  return panels
})

const activePanelMeta = computed(
  () => toolPanels.value.find((p) => p.id === activeToolPanel.value) || toolPanels.value[0]
)

const wizardDone = ref(false)
const generating = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const result = ref(null)
const previewKey = ref(0)
const activePreview = ref('assembly')
const basePreviewParts = ref([])
const lidPreviewParts = ref([])
const assemblyPreviewParts = ref([])

const activePreviewParts = computed(() => {
  if (activePreview.value === 'base') return basePreviewParts.value
  if (activePreview.value === 'lid') return lidPreviewParts.value
  return assemblyPreviewParts.value
})

const previewTabs = computed(() => {
  const tabs = [
    { id: 'assembly', label: 'Perakitan' },
    { id: 'base', label: 'Base' },
    { id: 'lid', label: 'Lid' }
  ]
  return tabs
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
  errorMsg.value = ''
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
      line: p.line
    }))
    lidPreviewParts.value = (out.lidPreviewParts || out.accentPreviewParts).map((p) => ({
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
    errorMsg.value = e?.message || 'Gagal membuat model clicker'
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

  if (!blob) {
    toast.error('Part lid tidak tersedia')
    return
  }
  downloadBlob(blob, filename)
  const fmtLabel = exportFormats.find((f) => f.id === fmt)?.label || fmt
  toast.success(`Unduh ${part === 'base' ? 'base' : 'lid'} (${fmtLabel})`)
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
    if (result.value.getAccentBlob()) {
      await uploadBlob(result.value.getAccentBlob(), result.value.accentFilename)
    }
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
  clearPreviews()
  const prevDispose = disposePrev
  disposePrev = null
  prevDispose?.()
}
</script>

<template>
  <ClickerWizard v-if="!wizardDone" @complete="onWizardComplete" />

  <div class="h-full flex flex-col p-2 sm:p-3 min-h-0" :class="{ 'invisible pointer-events-none': !wizardDone }">
    <div class="panel overflow-hidden flex flex-col md:flex-row flex-1 min-h-0">
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
          @click="activeToolPanel = panel.id"
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
          <template v-if="activeToolPanel === 'design'">
            <button type="button" class="text-[11px] text-accent-600 hover:underline mb-1" @click="restartWizard">
              Setup ulang…
            </button>
            <KeychainCompactField label="Label">
              <input v-model="form.label" class="input text-sm" maxlength="32" />
            </KeychainCompactField>
            <ClickerDesignPicker
              v-model:shape-mode="form.shapeMode"
              v-model:text="form.text"
              v-model:font-url="form.fontUrl"
              v-model:svg-content="form.svgContent"
              v-model:max-size-mm="form.maxSizeMm"
              v-model:display-mode="form.displayMode"
              v-model:keyring-enabled="form.keyringEnabled"
            />
          </template>

          <template v-else-if="activeToolPanel === 'switch'">
            <ClickerSwitchPicker v-model="form.switchPresetId" />
            <KeychainCompactField label="Toleransi fit" unit="mm">
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
            <p class="text-[10px] text-ink-400 font-mono">
              Pocket: {{ activePreset.housingOuterMm + form.fitToleranceMm * 2 }} mm ·
              {{ activePreset.bodyDepthMm + form.fitToleranceMm }} mm deep
            </p>
          </template>

          <template v-else-if="activeToolPanel === 'base'">
            <p class="text-[11px] text-ink-500">Preset: <strong>{{ activePreset.name }}</strong></p>
            <dl class="space-y-1 text-[11px] font-mono text-ink-600">
              <div class="flex justify-between"><dt class="text-ink-400">Housing</dt><dd>{{ activePreset.housingOuterMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Plate cutout</dt><dd>{{ activePreset.plateCutoutMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Body depth</dt><dd>{{ activePreset.bodyDepthMm }} mm</dd></div>
              <div class="flex justify-between"><dt class="text-ink-400">Pin spacing</dt><dd>{{ activePreset.pinSpacingMm }} mm</dd></div>
            </dl>
          </template>

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

          <p v-if="errorMsg" class="text-xs text-red-600">{{ errorMsg }}</p>
        </div>
      </aside>

      <div class="order-3 flex-1 min-w-0 flex flex-col">
        <div class="shrink-0 border-b border-ink-200 bg-white px-3 py-2 space-y-2">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PaintBrushIcon class="w-4 h-4 text-accent-600 shrink-0" />
            <div class="flex flex-wrap items-center gap-2">
              <label
                v-for="c in COLOR_FIELDS"
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
              <span>{{ result.dimensions.widthMm }}×{{ result.dimensions.depthMm }}×{{ result.dimensions.heightMm }} mm</span>
              <span class="text-ink-300">|</span>
              <span>Pocket {{ result.dimensions.housingPocketMm }} mm</span>
              <span class="text-ink-300">|</span>
              <span>±{{ result.dimensions.fitToleranceMm }} tol</span>
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
