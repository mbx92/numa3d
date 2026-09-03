<script setup>
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CubeTransparentIcon
} from '@heroicons/vue/24/outline'
import { useToast } from '~/composables/useToast.js'
import {
  fetchLibraryMeshBuffer,
  isMeshClickerFile,
  meshFileExt
} from '~/utils/clickerManifold/meshImport.js'
import { suggestMeshClickerSplit } from '~/utils/clickerManifold/meshSplitSuggest.js'

const meshBuffer = defineModel('meshBuffer', { default: null })
const meshFilename = defineModel('meshFilename', { type: String, default: '' })
const meshLibraryFileId = defineModel('meshLibraryFileId', { default: null })
const meshReliefHeightMm = defineModel('meshReliefHeightMm', { type: Number, default: 45 })
const meshSplitLidRatio = defineModel('meshSplitLidRatio', { type: Number, default: 0.32 })
const meshSplitRegion = defineModel('meshSplitRegion', {
  type: Object,
  default: () => ({ u: 0.5, v: 0.5, wu: 1, wv: 1 })
})
const meshStemBuryMm = defineModel('meshStemBuryMm', { type: Number, default: 2.5 })
const meshUpAxis = defineModel('meshUpAxis', { type: String, default: 'auto' })
const meshSourceMode = defineModel('meshSourceMode', { type: String, default: 'split' })
const meshLidBuffer = defineModel('meshLidBuffer', { default: null })
const meshLidFilename = defineModel('meshLidFilename', { type: String, default: '' })
const meshBaseBuffer = defineModel('meshBaseBuffer', { default: null })
const meshBaseFilename = defineModel('meshBaseFilename', { type: String, default: '' })
const maxSizeMm = defineModel('maxSizeMm', { type: Number, default: 45 })
const displayMode = defineModel('displayMode', { type: String, default: 'preview' })
const keyringEnabled = defineModel('keyringEnabled', { type: Boolean, default: false })
const keyringAngleDeg = defineModel('keyringAngleDeg', { type: Number, default: 270 })

const props = defineProps({
  autoSelectId: { type: [Number, String], default: null }
})

const emit = defineEmits(['loaded'])

const toast = useToast()
const meshFileInput = ref(null)
const lidFileInput = ref(null)
const baseFileInput = ref(null)
const meshLoading = ref(false)
const loadError = ref('')
const gallerySearch = ref('')
const suggestInfo = ref(null)
const suggestBusy = ref(false)
const isPartsMode = computed(() => meshSourceMode.value === 'parts')
const hasLoadedMesh = computed(
  () => meshBuffer.value != null && typeof meshBuffer.value.byteLength === 'number' && meshBuffer.value.byteLength >= 84
)

async function applyAutoSplitSuggest(buffer, filename, { quiet = false } = {}) {
  if (!(buffer instanceof ArrayBuffer)) return null
  suggestBusy.value = true
  try {
    const suggestion = suggestMeshClickerSplit(buffer.slice(0), filename || '', meshUpAxis.value || 'auto')
    suggestInfo.value = {
      reason: suggestion.reason,
      confidence: suggestion.confidence,
      method: suggestion.method,
      mode: suggestion.mode
    }

    if (suggestion.upAxis && suggestion.upAxis !== 'auto') {
      meshUpAxis.value = suggestion.remapped || suggestion.mode === 'parts' ? suggestion.upAxis : suggestion.upAxis
    }
    // Buffer STL hasil multi-body sudah Z-up
    if (suggestion.mode === 'parts' && suggestion.lidBuffer && suggestion.baseBuffer) {
      meshSourceMode.value = 'parts'
      meshLidBuffer.value = suggestion.lidBuffer
      meshBaseBuffer.value = suggestion.baseBuffer
      meshLidFilename.value = `${(filename || 'model').replace(/\.(3mf|stl)$/i, '')}-lid.stl`
      meshBaseFilename.value = `${(filename || 'model').replace(/\.(3mf|stl)$/i, '')}-base.stl`
      meshBuffer.value = suggestion.baseBuffer.slice(0)
      meshFilename.value = meshBaseFilename.value
      meshUpAxis.value = 'z'
      if (!quiet) {
        toast.success('Model terpisah otomatis (lid + base). Silakan Generate.')
      }
      return suggestion
    }

    meshSourceMode.value = 'split'
    meshSplitLidRatio.value = suggestion.lidRatio
    meshSplitRegion.value = { ...(suggestion.region || { u: 0.5, v: 0.5, wu: 1, wv: 1 }) }
    if (suggestion.upAxis) meshUpAxis.value = suggestion.upAxis === 'z' && !suggestion.remapped ? 'z' : suggestion.upAxis
    if (!quiet) {
      const pct = Math.round(suggestion.lidRatio * 100)
      toast.success(`Potongan disarankan: lid ${pct}% — ${suggestion.reason}`)
    }
    return suggestion
  } catch (e) {
    suggestInfo.value = { reason: e?.message || 'Gagal deteksi', confidence: 0 }
    if (!quiet) toast.info('Deteksi otomatis gagal — atur potongan manual di preview')
    return null
  } finally {
    suggestBusy.value = false
  }
}

async function runAutoDetect() {
  const buf =
    meshSourceMode.value === 'parts' && meshBaseBuffer.value instanceof ArrayBuffer
      ? null
      : meshBuffer.value
  if (!(buf instanceof ArrayBuffer)) {
    toast.error('Muat mesh dulu untuk deteksi potongan')
    return
  }
  await applyAutoSplitSuggest(buf, meshFilename.value, { quiet: false })
}

const {
  data: libraryFiles,
  pending: libraryPending,
  refresh: refreshLibrary,
  error: libraryError
} = useFetch('/api/library-files', { key: 'mesh-clicker-library-files' })

const meshLibraryFiles = computed(() =>
  (libraryFiles.value || []).filter((file) => isMeshClickerFile(file))
)

const filteredGalleryFiles = computed(() => {
  const q = gallerySearch.value.trim().toLowerCase()
  const rows = meshLibraryFiles.value
  if (!q) return rows
  return rows.filter((f) => String(f.filename || '').toLowerCase().includes(q))
})

const splitPct = computed({
  get() {
    return Math.round((Number(meshSplitLidRatio.value) || 0.32) * 100)
  },
  set(v) {
    meshSplitLidRatio.value = Math.max(0.12, Math.min(0.7, Number(v) / 100))
  }
})

const regionWPct = computed({
  get() {
    return Math.round((Number(meshSplitRegion.value?.wu) || 1) * 100)
  },
  set(v) {
    const wv = Number(meshSplitRegion.value?.wv) || 1
    const wu = Math.max(0.08, Math.min(1, Number(v) / 100))
    const u = Number(meshSplitRegion.value?.u) || 0.5
    const vv = Number(meshSplitRegion.value?.v) || 0.5
    meshSplitRegion.value = {
      u: Math.max(wu / 2, Math.min(1 - wu / 2, u)),
      v: Math.max(wv / 2, Math.min(1 - wv / 2, vv)),
      wu,
      wv
    }
  }
})

const regionDPct = computed({
  get() {
    return Math.round((Number(meshSplitRegion.value?.wv) || 1) * 100)
  },
  set(v) {
    const wu = Number(meshSplitRegion.value?.wu) || 1
    const wv = Math.max(0.08, Math.min(1, Number(v) / 100))
    const u = Number(meshSplitRegion.value?.u) || 0.5
    const vv = Number(meshSplitRegion.value?.v) || 0.5
    meshSplitRegion.value = {
      u: Math.max(wu / 2, Math.min(1 - wu / 2, u)),
      v: Math.max(wv / 2, Math.min(1 - wv / 2, vv)),
      wu,
      wv
    }
  }
})

const activeLabel = computed(() => {
  if (!meshFilename.value) return ''
  const src = meshLibraryFileId.value ? `Galeri #${meshLibraryFileId.value}` : 'Upload lokal'
  return `${meshFilename.value} · ${src}`
})

async function applyMeshBuffer(buffer, filename, libraryId = null) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 84) {
    throw new Error('File mesh kosong atau tidak valid')
  }
  meshBuffer.value = buffer
  meshFilename.value = filename
  meshLibraryFileId.value = libraryId
  loadError.value = ''
  emit('loaded', { filename, libraryId, byteLength: buffer.byteLength })
  await applyAutoSplitSuggest(buffer, filename, { quiet: false })
}

async function useMeshFile(file, libraryId = null) {
  if (!file) return
  if (!isMeshClickerFile(file)) {
    toast.error('Format harus .3mf atau .stl')
    return
  }
  const maxBytes = 25 * 1024 * 1024
  if (file.size > maxBytes) {
    toast.error('Ukuran mesh maksimal 25 MB')
    return
  }
  meshLoading.value = true
  loadError.value = ''
  try {
    await applyMeshBuffer(await file.arrayBuffer(), file.name, libraryId)
    toast.success(`Mesh siap: ${file.name}`)
  } catch (e) {
    loadError.value = e?.message || 'Gagal membaca file mesh'
    toast.error(loadError.value)
  } finally {
    meshLoading.value = false
    if (meshFileInput.value) meshFileInput.value.value = ''
  }
}

async function uploadMeshFile(event) {
  const file = event?.target?.files?.[0]
  await useMeshFile(file, null)
}

async function loadGalleryMesh(id, { quiet = false } = {}) {
  const numericId = Number(id || 0)
  if (!numericId) {
    meshBuffer.value = null
    meshFilename.value = ''
    meshLibraryFileId.value = null
    loadError.value = ''
    return false
  }

  const file =
    meshLibraryFiles.value.find((item) => Number(item.id) === numericId) ||
    (libraryFiles.value || []).find((item) => Number(item.id) === numericId)

  if (!file) {
    loadError.value = 'File tidak ditemukan di galeri'
    if (!quiet) toast.error(loadError.value)
    return false
  }
  if (!isMeshClickerFile(file)) {
    loadError.value = 'File ini bukan .3mf/.stl — belum bisa dijadikan clicker'
    if (!quiet) toast.error(loadError.value)
    return false
  }

  meshLoading.value = true
  loadError.value = ''
  try {
    const buffer = await fetchLibraryMeshBuffer(numericId)
    await applyMeshBuffer(buffer, file.filename, numericId)
    if (!quiet) toast.success(`Mesh dari galeri: ${file.filename}`)
    return true
  } catch (e) {
    loadError.value = e?.message || 'Gagal mengambil mesh dari galeri'
    if (!quiet) toast.error(loadError.value)
    return false
  } finally {
    meshLoading.value = false
  }
}

async function selectGalleryMesh(file) {
  if (!file) return
  if (Number(meshLibraryFileId.value) === Number(file.id) && meshBuffer.value) return
  await loadGalleryMesh(file.id)
}

let autoLoadToken = 0
watch(
  () => [props.autoSelectId, libraryFiles.value],
  async ([id, files]) => {
    const numericId = Number(id || 0)
    if (!numericId) return
    if (!Array.isArray(files)) return
    if (Number(meshLibraryFileId.value) === numericId && meshBuffer.value instanceof ArrayBuffer) return

    const token = ++autoLoadToken
    // Tunggu list galeri tersedia (bisa kosong dulu saat hydration)
    const found = files.find((f) => Number(f.id) === numericId)
    if (!found) {
      if (files.length) {
        loadError.value = `File #${numericId} tidak ada di galeri`
        toast.error(loadError.value)
      }
      return
    }
    meshLoading.value = true
    const ok = await loadGalleryMesh(numericId, { quiet: false })
    if (token !== autoLoadToken) return
    if (ok) {
      /* loaded */
    }
  },
  { immediate: true }
)

async function usePartFile(event, which) {
  const file = event?.target?.files?.[0]
  if (!file) return
  if (!isMeshClickerFile(file)) {
    toast.error('Format harus .3mf atau .stl')
    return
  }
  meshLoading.value = true
  loadError.value = ''
  try {
    const buffer = await file.arrayBuffer()
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 84) {
      throw new Error('File mesh kosong atau tidak valid')
    }
    if (which === 'lid') {
      meshLidBuffer.value = buffer
      meshLidFilename.value = file.name
    } else {
      meshBaseBuffer.value = buffer
      meshBaseFilename.value = file.name
      // Footprint / skala dari base
      meshBuffer.value = buffer
      meshFilename.value = file.name
      meshLibraryFileId.value = null
    }
    emit('loaded', { filename: file.name, part: which, byteLength: buffer.byteLength })
    toast.success(`${which === 'lid' ? 'Lid' : 'Base'} siap: ${file.name}`)
  } catch (e) {
    loadError.value = e?.message || 'Gagal membaca file'
    toast.error(loadError.value)
  } finally {
    meshLoading.value = false
    if (which === 'lid' && lidFileInput.value) lidFileInput.value.value = ''
    if (which === 'base' && baseFileInput.value) baseFileInput.value.value = ''
  }
}

defineExpose({ refreshLibrary, loadGalleryMesh, runAutoDetect })
</script>

<template>
  <div class="space-y-3">
    <div class="rounded-lg border border-accent-200 bg-accent-50/50 px-3 py-2 text-[11px] text-accent-900 leading-relaxed">
      <template v-if="isPartsMode">
        Paling andal untuk kaktus+pot: upload <strong>dua file</strong> yang sudah dipisah
        (lid = kaktus, base = pot) dari Blender/Meshmixer — .3mf atau .stl.
      </template>
      <template v-else>
        Satu file: sistem mendeteksi titik potong (bibir pot / pinggang mesh) otomatis.
        Bisa dikoreksi di tab Potongan. Mode <strong>Dua file</strong> tetap tersedia.
      </template>
    </div>

    <div class="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5 text-[11px] w-full">
      <button
        type="button"
        class="flex-1 rounded-md px-2.5 py-1.5 transition-colors"
        :class="!isPartsMode ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-500'"
        @click="meshSourceMode = 'split'"
      >
        Satu file (potong)
      </button>
      <button
        type="button"
        class="flex-1 rounded-md px-2.5 py-1.5 transition-colors"
        :class="isPartsMode ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-500'"
        @click="meshSourceMode = 'parts'"
      >
        Dua file (base+lid)
      </button>
    </div>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Sumbu atas model</span>
      <select v-model="meshUpAxis" class="input text-sm">
        <option value="auto">Auto (sumbu terpanjang)</option>
        <option value="z">Z (standar CAD)</option>
        <option value="y">Y (Blender / glTF)</option>
        <option value="x">X</option>
      </select>
      <p class="text-[10px] text-ink-400">
        Jika potongan melintang badan (bukan di bibir pot), ganti sumbu — coba Y atau Z.
      </p>
    </label>

    <button
      type="button"
      class="btn-secondary w-full text-sm"
      :disabled="meshLoading || suggestBusy || !hasLoadedMesh"
      @click="runAutoDetect"
    >
      <ArrowPathIcon class="w-4 h-4" :class="suggestBusy ? 'animate-spin' : ''" />
      {{ suggestBusy ? 'Mendeteksi…' : 'Deteksi potongan otomatis' }}
    </button>
    <p v-if="suggestInfo?.reason" class="text-[10px] text-ink-500 leading-snug -mt-1">
      {{ suggestInfo.mode === 'parts' ? 'Mode: dua body · ' : '' }}{{ suggestInfo.reason }}
      <span v-if="suggestInfo.confidence" class="text-ink-400">
        · yakin {{ Math.round(suggestInfo.confidence * 100) }}%</span
      >
    </p>

    <template v-if="isPartsMode">
      <label class="btn-secondary w-full cursor-pointer text-sm">
        <ArrowUpTrayIcon class="w-4 h-4" />
        {{ meshLidFilename ? `Lid: ${meshLidFilename}` : 'Upload lid (kaktus) .3mf/.stl' }}
        <input
          ref="lidFileInput"
          type="file"
          accept=".3mf,.stl,model/3mf,model/stl"
          class="hidden"
          :disabled="meshLoading"
          @change="usePartFile($event, 'lid')"
        />
      </label>
      <label class="btn-secondary w-full cursor-pointer text-sm">
        <ArrowUpTrayIcon class="w-4 h-4" />
        {{ meshBaseFilename ? `Base: ${meshBaseFilename}` : 'Upload base (pot) .3mf/.stl' }}
        <input
          ref="baseFileInput"
          type="file"
          accept=".3mf,.stl,model/3mf,model/stl"
          class="hidden"
          :disabled="meshLoading"
          @change="usePartFile($event, 'base')"
        />
      </label>
    </template>

    <template v-else>

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-ink-700">Dari Galeri 3D</span>
        <button
          type="button"
          class="text-[11px] text-accent-600 hover:text-accent-700 disabled:opacity-40"
          :disabled="libraryPending || meshLoading"
          @click="refreshLibrary()"
        >
          Muat ulang
        </button>
      </div>

      <input
        v-if="meshLibraryFiles.length > 6"
        v-model="gallerySearch"
        class="input text-sm"
        placeholder="Cari nama file…"
      />

      <div
        v-if="libraryPending && !meshLibraryFiles.length"
        class="rounded-lg border border-ink-200 px-3 py-4 text-center text-xs text-ink-500"
      >
        <ArrowPathIcon class="w-4 h-4 animate-spin inline-block mr-1" />
        Memuat galeri…
      </div>

      <p v-else-if="libraryError" class="text-xs text-red-600">
        Gagal memuat galeri. Coba muat ulang.
      </p>

      <div
        v-else-if="!meshLibraryFiles.length"
        class="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center space-y-2"
      >
        <CubeTransparentIcon class="w-6 h-6 text-ink-300 mx-auto" />
        <p class="text-xs text-ink-500">Belum ada .3mf / .stl di Galeri.</p>
        <NuxtLink to="/gallery" class="text-xs font-medium text-accent-600 hover:text-accent-700">
          Buka Galeri &amp; upload →
        </NuxtLink>
      </div>

      <div
        v-else
        class="max-h-48 overflow-y-auto rounded-lg border border-ink-200 divide-y divide-ink-100"
      >
        <button
          v-for="file in filteredGalleryFiles"
          :key="file.id"
          type="button"
          class="w-full text-left px-3 py-2.5 transition-colors disabled:opacity-50"
          :class="
            Number(meshLibraryFileId) === Number(file.id)
              ? 'bg-accent-50 text-accent-900'
              : 'hover:bg-ink-50 text-ink-800'
          "
          :disabled="meshLoading"
          @click="selectGalleryMesh(file)"
        >
          <span class="block text-xs font-medium truncate">{{ file.filename }}</span>
          <span class="block text-[10px] text-ink-400 font-mono uppercase mt-0.5">
            {{ meshFileExt(file.filename) }}
            <template v-if="Number(meshLibraryFileId) === Number(file.id)"> · dipilih</template>
          </span>
        </button>
        <p v-if="gallerySearch && !filteredGalleryFiles.length" class="px-3 py-3 text-xs text-ink-500">
          Tidak ada file yang cocok.
        </p>
      </div>
    </div>

    <label class="btn-secondary w-full cursor-pointer text-sm">
      <ArrowUpTrayIcon class="w-4 h-4" />
      {{ meshLoading ? 'Membaca mesh…' : 'Upload .3mf / .stl lokal' }}
      <input
        ref="meshFileInput"
        type="file"
        accept=".3mf,.stl,model/3mf,model/stl"
        class="hidden"
        :disabled="meshLoading"
        @change="uploadMeshFile"
      />
    </label>

    <div
      v-if="activeLabel || loadError || meshLoading"
      class="rounded-lg border px-3 py-2 text-[11px]"
      :class="
        loadError
          ? 'border-red-200 bg-red-50 text-red-700'
          : meshLoading
            ? 'border-ink-200 bg-ink-50 text-ink-600'
            : 'border-green-200 bg-green-50 text-green-800'
      "
    >
      <span v-if="meshLoading" class="inline-flex items-center gap-1.5">
        <ArrowPathIcon class="w-3.5 h-3.5 animate-spin" />
        Memuat mesh…
      </span>
      <span v-else-if="loadError">{{ loadError }}</span>
      <span v-else class="break-all">Aktif: {{ activeLabel }}</span>
    </div>
    </template>

    <template v-if="!isPartsMode">
    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Rasio lid (bagian atas)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="splitPct" type="range" min="12" max="70" step="1" class="flex-1" />
        <span class="text-xs font-mono w-12 text-right">{{ splitPct }}%</span>
      </div>
      <p class="text-[10px] text-ink-400">
        Bidang = tinggi potong (atas↔bawah). Resizer = kolom XY — bagian luar kotak tidak terbelah.
        Kaktus+pot: wilayah 100%, bidang di bibir pot.
      </p>
    </label>

    <div class="grid grid-cols-2 gap-2">
      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Lebar wilayah</span>
        <div class="flex items-center gap-2">
          <input v-model.number="regionWPct" type="range" min="8" max="100" step="1" class="flex-1" />
          <span class="text-xs font-mono w-10 text-right">{{ regionWPct }}%</span>
        </div>
      </label>
      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Dalam wilayah</span>
        <div class="flex items-center gap-2">
          <input v-model.number="regionDPct" type="range" min="8" max="100" step="1" class="flex-1" />
          <span class="text-xs font-mono w-10 text-right">{{ regionDPct }}%</span>
        </div>
      </label>
    </div>
    <p class="text-[10px] text-ink-400 -mt-1">
      Di preview: bola oranye = resize sudut, biru = geser posisi, bidang = tinggi potong.
    </p>
    </template>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Ketebalan dudukan stem (mm)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="meshStemBuryMm" type="range" min="0.8" max="6" step="0.1" class="flex-1" />
        <span class="text-xs font-mono w-10 text-right">{{ meshStemBuryMm }}</span>
      </div>
      <p class="text-[10px] text-ink-400">
        Dudukan dibuat di bawah lid; stem hanya overlap tipis agar menyatu tanpa menembus wajah mesh.
      </p>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Ukuran maks. XY (mm)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="maxSizeMm" type="range" min="28" max="80" step="1" class="flex-1" />
        <span class="text-xs font-mono w-10 text-right">{{ maxSizeMm }}</span>
      </div>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Tinggi maks. mesh (mm)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="meshReliefHeightMm" type="range" min="12" max="70" step="1" class="flex-1" />
        <span class="text-xs font-mono w-10 text-right">{{ meshReliefHeightMm }}</span>
      </div>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Mode tampilan</span>
      <select v-model="displayMode" class="input text-sm">
        <option value="preview">Preview — lid terpasang</option>
        <option value="exploded">Exploded — lid terangkat</option>
        <option value="print">Print — base & lid berdampingan</option>
      </select>
    </label>

    <label class="flex items-center gap-2 cursor-pointer">
      <input v-model="keyringEnabled" type="checkbox" class="rounded border-ink-300" />
      <span class="text-xs text-ink-700">Loop keyring di base</span>
    </label>

    <div v-if="keyringEnabled" class="grid grid-cols-2 gap-1.5">
      <button
        type="button"
        class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
        :class="
          Number(keyringAngleDeg) === 270
            ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
            : 'border-ink-200 text-ink-600 hover:border-ink-300'
        "
        @click="keyringAngleDeg = 270"
      >
        Kiri
      </button>
      <button
        type="button"
        class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
        :class="
          Number(keyringAngleDeg) === 0
            ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
            : 'border-ink-200 text-ink-600 hover:border-ink-300'
        "
        @click="keyringAngleDeg = 0"
      >
        Atas
      </button>
    </div>
  </div>
</template>
