<script setup>
import { ArrowPathIcon, ArrowDownTrayIcon, CloudArrowUpIcon, CubeIcon } from '@heroicons/vue/24/outline'
import {
  ATTACHMENT_TYPES,
  KEYCHAIN_DEFAULTS,
  generateKeychain,
  downloadBlob,
  resolveInsertFit,
  resolveEyeletLayout
} from '~/utils/keychainGenerator.js'
import { KEYCHAIN_THEME_LIST, getKeychainTheme } from '~/utils/keychainThemes.js'

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()

const themes = KEYCHAIN_THEME_LIST
const attachmentTypes = ATTACHMENT_TYPES
const form = reactive({ ...KEYCHAIN_DEFAULTS })
const activeTheme = computed(() => getKeychainTheme(form.themeId))
const activeAttachment = computed(
  () => attachmentTypes.find((t) => t.id === form.attachmentType) || attachmentTypes[0]
)

/** Pratinjau hubungan parameter sebelum generate. */
const insertFit = computed(() => resolveInsertFit(form))
const cavityDepthPreview = computed(() => insertFit.value.cavityDepth.toFixed(2))
const maxTextPreview = computed(() => insertFit.value.maxTextH.toFixed(2))
const eyeletLayout = computed(() =>
  form.attachmentType === 'hole' ? resolveEyeletLayout(form) : null
)

function applyThemeDefaults(themeId) {
  const theme = getKeychainTheme(themeId)
  const attachmentType = form.attachmentType
  Object.assign(form, { themeId: theme.id, ...theme.defaults, attachmentType })
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
const activePreviewLabel = computed(() => {
  if (activePreview.value === 'base') return 'Base'
  if (activePreview.value === 'text') return 'Teks'
  return 'Perakitan'
})
const activePreviewFilename = computed(() => {
  if (activePreview.value === 'base') return result.value?.baseFilename
  if (activePreview.value === 'text') return result.value?.textFilename
  return `${result.value?.baseFilename} + ${result.value?.textFilename}`
})

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
  try {
    disposePrev?.()
    clearPreviews()
    const out = await generateKeychain({ ...form })
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

function downloadPart(part) {
  if (!result.value) return
  if (part === 'base') downloadBlob(result.value.getBaseBlob(), result.value.baseFilename)
  else downloadBlob(result.value.getTextBlob(), result.value.textFilename)
  toast.success(`Unduh ${part === 'base' ? 'base' : 'teks'} STL`)
}

function uploadBlob(blob, filename) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', new File([blob], filename, { type: 'model/stl' }))
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

onMounted(() => {
  runGenerate()
})
</script>

<template>
  <div class="space-y-4 max-w-6xl">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold flex items-center gap-2">
          <CubeIcon class="w-6 h-6 text-accent-500" />
          Generator Keychain
        </h1>
        <p class="text-sm text-ink-500 mt-1">
          Theme menentukan font & plate insert. Pilih attachment lubang ring atau hook kait.
        </p>
      </div>
      <NuxtLink to="/gallery" class="btn-secondary text-sm">Galeri 3D</NuxtLink>
    </div>

    <div class="grid lg:grid-cols-[minmax(0,20rem)_1fr] gap-4 items-start">
      <section class="panel p-4 space-y-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-600">Parameter</h2>

        <label class="block space-y-1">
          <span class="text-xs font-medium text-ink-600">Teks</span>
          <input v-model="form.text" class="input" maxlength="40" placeholder="SHAREN 77" />
        </label>

        <label class="block space-y-1">
          <span class="text-xs font-medium text-ink-600">Theme</span>
          <select
            v-model="form.themeId"
            class="input"
            @change="applyThemeDefaults(form.themeId)"
          >
            <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <p class="text-[11px] text-ink-500 leading-snug">
            {{ activeTheme.description }}
            <span class="text-ink-400">· {{ activeTheme.fontLabel }}</span>
          </p>
        </label>

        <label class="block space-y-1">
          <span class="text-xs font-medium text-ink-600">Attachment</span>
          <select v-model="form.attachmentType" class="input">
            <option v-for="t in attachmentTypes" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
          <p class="text-[11px] text-ink-500">{{ activeAttachment.description }}</p>
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Tinggi tag (mm)</span>
            <input v-model.number="form.targetHeightMm" type="number" min="10" max="40" step="0.5" class="input-num" />
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Lebar teks (mm)</span>
            <input v-model.number="form.targetWidthMm" type="number" min="20" max="120" step="0.5" class="input-num" />
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Padding (mm)</span>
            <input v-model.number="form.paddingMm" type="number" min="1" max="10" step="0.5" class="input-num" />
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Tebal base (mm)</span>
            <input v-model.number="form.baseThicknessMm" type="number" min="2" max="8" step="0.1" class="input-num" />
            <p class="text-[11px] text-ink-500">Mempengaruhi kedalaman cavity & batas maks. tebal teks.</p>
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Tebal teks (mm)</span>
            <input
              v-model.number="form.textThicknessMm"
              type="number"
              :max="insertFit.maxTextH"
              min="0.5"
              step="0.1"
              class="input-num"
            />
            <p class="text-[11px] text-ink-500">
              Maks. {{ maxTextPreview }} mm
              <span class="text-ink-400">(base − lantai − clearance atas)</span>
              <span v-if="insertFit.textClamped" class="text-amber-600"> · akan dipotong</span>
            </p>
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Lantai base (mm)</span>
            <input v-model.number="form.floorThicknessMm" type="number" min="0.2" max="2" step="0.1" class="input-num" />
            <p class="text-[11px] text-ink-500">Cavity dalam = {{ cavityDepthPreview }} mm.</p>
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Plate luar (mm)</span>
            <input v-model.number="form.plateOuterMarginMm" type="number" min="0" max="4" step="0.1" class="input-num" />
            <p class="text-[11px] text-ink-500">Tepi plate di luar huruf (ring).</p>
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Plate dalam (mm)</span>
            <input v-model.number="form.plateInnerBridgeMm" type="number" min="0" max="6" step="0.1" class="input-num" />
            <p class="text-[11px] text-ink-500">Isi celah antar huruf & area dalam teks (mis. 7-7).</p>
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Jarak huruf (mm)</span>
            <input v-model.number="form.letterSpacingMm" type="number" min="-2" max="2" step="0.1" class="input-num" />
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Clearance sisi (mm)</span>
            <input v-model.number="form.cavityClearanceMm" type="number" min="0.05" max="0.5" step="0.02" class="input-num" />
            <p class="text-[11px] text-ink-500">Cavity base = plate + clearance ini.</p>
          </label>
          <label class="block space-y-1">
            <span class="text-xs font-medium text-ink-600">Clearance atas (mm)</span>
            <input v-model.number="form.topClearanceMm" type="number" min="0" max="0.3" step="0.02" class="input-num" />
            <p class="text-[11px] text-ink-500">Ruang di atas insert; mengurangi maks. tebal teks.</p>
          </label>

          <template v-if="form.attachmentType === 'hole'">
            <label class="block space-y-1">
              <span class="text-xs font-medium text-ink-600">Ø eyelet luar (mm)</span>
              <input v-model.number="form.eyeletOuterDiameterMm" type="number" min="5" max="14" step="0.5" class="input-num" />
            </label>
            <label class="block space-y-1">
              <span class="text-xs font-medium text-ink-600">Eyelet overlap (mm)</span>
              <input v-model.number="form.eyeletOverlapMm" type="number" min="0.5" max="8" step="0.1" class="input-num" />
              <p class="text-[11px] text-ink-500">
                Kecil = eyelet lebih keluar · besar = masuk ke body.
                <span v-if="eyeletLayout"> Offset teks kiri: {{ eyeletLayout.attachReach.toFixed(1) }} mm.</span>
              </p>
            </label>
            <label class="block space-y-1">
              <span class="text-xs font-medium text-ink-600">Ø lubang ring (mm)</span>
              <input v-model.number="form.keyringHoleDiameterMm" type="number" min="3" max="8" step="0.1" class="input-num" />
            </label>
          </template>

          <template v-else>
            <label class="block space-y-1">
              <span class="text-xs font-medium text-ink-600">Ø hook luar (mm)</span>
              <input v-model.number="form.hookOuterDiameterMm" type="number" min="6" max="16" step="0.5" class="input-num" />
            </label>
            <label class="block space-y-1">
              <span class="text-xs font-medium text-ink-600">Tebal hook (mm)</span>
              <input v-model.number="form.hookThicknessMm" type="number" min="1.5" max="5" step="0.1" class="input-num" />
            </label>
            <label class="block space-y-1 col-span-2">
              <span class="text-xs font-medium text-ink-600">Bukaan kait (°)</span>
              <input v-model.number="form.hookGapDegrees" type="number" min="30" max="90" step="5" class="input-num" />
            </label>
          </template>
        </div>

        <button type="button" class="btn-primary w-full" :disabled="generating" @click="runGenerate">
          <ArrowPathIcon class="w-4 h-4" :class="generating ? 'animate-spin' : ''" />
          {{ generating ? 'Membuat…' : 'Generate' }}
        </button>

        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>

        <div v-if="result" class="rounded-panel border border-ink-200 bg-ink-50 p-3 text-xs space-y-1 font-mono text-ink-600">
          <div>Tag: {{ result.dimensions.widthMm }} × {{ result.dimensions.heightMm }} mm</div>
          <div>
            Base {{ result.dimensions.baseThicknessMm }} mm
            · Lantai {{ result.dimensions.floorThicknessMm }} mm
            · Cavity {{ result.dimensions.cavityDepthMm }} mm
          </div>
          <div>
            Teks {{ result.dimensions.textThicknessMm }} mm
            <span v-if="result.dimensions.textClamped" class="text-amber-600">
              (diminta {{ result.dimensions.textThicknessRequestedMm }}, maks {{ result.dimensions.textThicknessMaxMm }})
            </span>
            <span v-else class="text-ink-400">/ maks {{ result.dimensions.textThicknessMaxMm }} mm</span>
          </div>
          <div>
            Clearance sisi {{ result.dimensions.sideClearanceMm }} mm
            · atas {{ result.dimensions.topClearanceMm }} mm
          </div>
          <div>Attachment: {{ result.attachmentType === 'hook' ? 'Hook' : 'Eyelet' }}</div>
          <div class="text-ink-500 font-sans normal-case">
            Rumus teks: min(tebal teks, base − lantai − clearance atas). Cavity mengikuti plate + clearance sisi.
          </div>
        </div>

        <div v-if="result" class="flex flex-col gap-2">
          <button type="button" class="btn-secondary w-full" @click="downloadPart('base')">
            <ArrowDownTrayIcon class="w-4 h-4" />
            Unduh {{ result.baseFilename }}
          </button>
          <button type="button" class="btn-secondary w-full" @click="downloadPart('text')">
            <ArrowDownTrayIcon class="w-4 h-4" />
            Unduh {{ result.textFilename }}
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="btn-primary w-full"
            :disabled="saving"
            @click="saveToGallery"
          >
            <CloudArrowUpIcon class="w-4 h-4" />
            {{ saving ? 'Menyimpan…' : 'Simpan ke Galeri 3D' }}
          </button>
        </div>
      </section>

      <section class="panel overflow-hidden">
        <div class="panel-header flex items-center justify-between gap-2">
          <span class="panel-title">Preview</span>
          <div v-if="result" class="flex rounded-lg border border-ink-200 overflow-hidden text-xs">
            <button
              type="button"
              class="px-2.5 py-1 transition-colors"
              :class="activePreview === 'assembly' ? 'bg-ink-800 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'"
              @click="activePreview = 'assembly'"
            >
              Perakitan
            </button>
            <button
              type="button"
              class="px-2.5 py-1 transition-colors border-l border-ink-200"
              :class="activePreview === 'base' ? 'bg-ink-800 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'"
              @click="activePreview = 'base'"
            >
              Base
            </button>
            <button
              type="button"
              class="px-2.5 py-1 transition-colors border-l border-ink-200"
              :class="activePreview === 'text' ? 'bg-ink-800 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'"
              @click="activePreview = 'text'"
            >
              Teks
            </button>
          </div>
        </div>
        <div class="p-3">
          <div class="space-y-2 min-w-0">
            <div class="flex items-center justify-between gap-2 px-1">
              <span class="text-xs font-semibold uppercase tracking-wide text-ink-600">{{ activePreviewLabel }}</span>
              <span v-if="result" class="text-[10px] text-ink-400 font-mono truncate">{{ activePreviewFilename }}</span>
            </div>
            <div class="relative w-full h-72 sm:h-80 rounded-panel border border-ink-100 bg-ink-50 overflow-hidden">
              <ClientOnly>
                <KeychainPreview
                  v-if="activePreviewParts.length"
                  :key="`${activePreview}-${previewKey}`"
                  :parts="activePreviewParts"
                  class="absolute inset-0 h-full w-full"
                />
                <div
                  v-else-if="generating"
                  class="absolute inset-0 flex items-center justify-center text-sm text-ink-500"
                >
                  Membuat model…
                </div>
                <div
                  v-else
                  class="absolute inset-0 flex items-center justify-center text-xs text-ink-400 px-3 text-center"
                >
                  Klik Generate untuk preview
                </div>
              </ClientOnly>
            </div>
          </div>
        </div>
        <p class="px-4 pb-4 text-xs text-ink-500">
          Tab Perakitan = simulasi pasang insert. Plate teks sedikit lebih lebar dari huruf; cavity base mengikuti contour plate (+ clearance) supaya muat setelah cetak 3D.
        </p>
      </section>
    </div>
  </div>
</template>
