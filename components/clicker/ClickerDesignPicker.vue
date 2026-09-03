<script setup>
import { SHAPE_MODES, DISPLAY_MODES, BASE_SHAPES, TILE_BASE_SHAPE_IDS, KEYRING_POSITIONS } from '~/utils/clickerPresets.js'
import {
  fetchLibraryMeshBuffer,
  isMeshClickerFile
} from '~/utils/clickerManifold/meshImport.js'

const shapeMode = defineModel('shapeMode', { type: String, default: 'rect' })
const baseShape = defineModel('baseShape', { type: String, default: 'outline' })
const text = defineModel('text', { type: String, default: '' })
const fontUrl = defineModel('fontUrl', { type: String, default: '' })
const svgContent = defineModel('svgContent', { type: String, default: '' })
const meshBuffer = defineModel('meshBuffer', { default: null })
const meshFilename = defineModel('meshFilename', { type: String, default: '' })
const meshLibraryFileId = defineModel('meshLibraryFileId', { default: null })
const meshReliefHeightMm = defineModel('meshReliefHeightMm', { type: Number, default: 35 })
const maxSizeMm = defineModel('maxSizeMm', { type: Number, default: 40 })
const displayMode = defineModel('displayMode', { type: String, default: 'preview' })
const keyringEnabled = defineModel('keyringEnabled', { type: Boolean, default: false })
const keyringAngleDeg = defineModel('keyringAngleDeg', { type: Number, default: 270 })

const modes = SHAPE_MODES
const baseShapes = BASE_SHAPES
const displayModes = DISPLAY_MODES
const keyringPositions = KEYRING_POSITIONS
const toast = useToast()
const meshFileInput = ref(null)
const meshLoading = ref(false)
const { data: libraryFiles, refresh: refreshLibrary } = await useFetch('/api/library-files', {
  key: 'clicker-design-library-files'
})
const meshLibraryFiles = computed(() =>
  (libraryFiles.value || []).filter((file) => isMeshClickerFile(file))
)
const visibleBaseShapes = computed(() => (
  shapeMode.value === 'rect'
    ? baseShapes.filter((s) => TILE_BASE_SHAPE_IDS.includes(s.id))
    : baseShapes
))
const baseShapeLabel = computed(() => (shapeMode.value === 'rect' ? 'Shape per huruf' : 'Shape lid'))

function normalizeBaseShape() {
  const availableShapes = visibleBaseShapes.value
  if (!availableShapes.some((shape) => shape.id === baseShape.value)) {
    const preferredShape = shapeMode.value === 'rect' ? 'square' : 'outline'
    baseShape.value = availableShapes.some((shape) => shape.id === preferredShape)
      ? preferredShape
      : availableShapes[0]?.id || 'square'
  }
}

watch(shapeMode, (mode) => {
  if (mode === 'rect' && baseShape.value === 'outline') baseShape.value = 'square'
  normalizeBaseShape()
}, { immediate: true })

watch(baseShape, normalizeBaseShape)

async function useMeshFile(file, libraryId = null) {
  if (!file) return
  if (!isMeshClickerFile(file)) {
    toast.error('Mesh harus format .3mf atau .stl')
    return
  }
  const maxBytes = 25 * 1024 * 1024
  if (file.size > maxBytes) {
    toast.error('Ukuran mesh maksimal 25 MB untuk generator clicker')
    return
  }
  meshLoading.value = true
  try {
    meshBuffer.value = await file.arrayBuffer()
    meshFilename.value = file.name
    meshLibraryFileId.value = libraryId
  } catch (e) {
    toast.error(e?.message || 'Gagal membaca file mesh')
  } finally {
    meshLoading.value = false
    if (meshFileInput.value) meshFileInput.value.value = ''
  }
}

async function uploadMeshFile(event) {
  const file = event?.target?.files?.[0]
  await useMeshFile(file, null)
}

async function selectGalleryMesh(event) {
  const id = Number(event?.target?.value || 0)
  if (!id) {
    meshBuffer.value = null
    meshFilename.value = ''
    meshLibraryFileId.value = null
    return
  }
  const file = meshLibraryFiles.value.find((item) => Number(item.id) === id)
  if (!file) return
  meshLoading.value = true
  try {
    meshBuffer.value = await fetchLibraryMeshBuffer(id)
    meshFilename.value = file.filename
    meshLibraryFileId.value = id
    toast.success(`Mesh dari galeri: ${file.filename}`)
  } catch (e) {
    toast.error(e?.message || 'Gagal mengambil mesh dari galeri')
  } finally {
    meshLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <span class="text-xs font-medium text-ink-700">Bentuk lid</span>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1.5">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="rounded-lg border px-2 py-2 text-left transition-colors"
          :class="
            shapeMode === m.id
              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200'
              : 'border-ink-200 hover:border-ink-300'
          "
          @click="shapeMode = m.id"
        >
          <span class="block text-xs font-medium text-ink-800">{{ m.label }}</span>
          <span class="block text-[10px] text-ink-400 leading-snug mt-0.5">{{ m.description }}</span>
        </button>
      </div>
    </div>

    <div>
      <span class="text-xs font-medium text-ink-700">{{ baseShapeLabel }}</span>
      <div class="grid grid-cols-4 gap-1 mt-1.5">
        <button
          v-for="s in visibleBaseShapes"
          :key="s.id"
          type="button"
          class="flex items-center justify-center rounded-md border p-2 transition-colors aspect-square"
          :class="
            baseShape === s.id
              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
              : 'border-ink-200 hover:border-ink-300 text-ink-600'
          "
          :title="`${s.label} — ${s.description}`"
          :aria-label="s.label"
          :aria-pressed="baseShape === s.id"
          @click="baseShape = s.id"
        >
          <ClickerBaseShapeIcon :shape="s.id" class="w-5 h-5" />
        </button>
      </div>
      <p class="text-[10px] text-ink-400 mt-1">
        {{ shapeMode === 'rect' ? 'Setiap huruf dibuat sebagai lid sendiri.' : 'Outline mengikuti siluet desain; shape lain membungkus artwork.' }}
      </p>
    </div>

    <template v-if="shapeMode === 'rect' || shapeMode === 'text'">
      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Teks lid</span>
        <input v-model="text" class="input text-sm font-semibold" maxlength="16" placeholder="CLICK" />
      </label>
      <KeychainFontPicker v-model="fontUrl" :preview-text="text || 'CLICK'" :show-downloader-link="false" />
    </template>

    <KeychainSvgUpload
      v-if="shapeMode === 'svg'"
      v-model:svg-content="svgContent"
      :svg-size-mm="maxSizeMm"
      :svg-gap-mm="0"
      @update:svg-size-mm="maxSizeMm = $event"
    />

    <div v-if="shapeMode === 'mesh'" class="space-y-2">
      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Mesh dari Galeri 3D</span>
        <select
          class="input text-sm"
          :value="meshLibraryFileId || ''"
          :disabled="meshLoading"
          @change="selectGalleryMesh"
        >
          <option value="">Pilih file .3mf / .stl…</option>
          <option v-for="file in meshLibraryFiles" :key="file.id" :value="file.id">
            {{ file.filename }}
          </option>
        </select>
        <button
          type="button"
          class="text-[11px] text-accent-600 hover:text-accent-700"
          :disabled="meshLoading"
          @click="refreshLibrary()"
        >
          Muat ulang daftar
        </button>
      </label>

      <label class="btn-secondary w-full cursor-pointer text-sm">
        {{ meshLoading ? 'Membaca mesh...' : 'Upload .3mf / .stl lokal' }}
        <input
          ref="meshFileInput"
          type="file"
          accept=".3mf,.stl,model/3mf,model/stl"
          class="hidden"
          :disabled="meshLoading"
          @change="uploadMeshFile"
        />
      </label>

      <p class="text-[10px] text-ink-400 break-all">
        {{ meshFilename ? `Aktif: ${meshFilename}` : 'Pilih model .3mf/.stl sebagai bagian atas clicker.' }}
      </p>
      <p class="text-[10px] text-ink-500">
        Mau potong model jadi base + lid (contoh hamburger)? Pakai
        <NuxtLink to="/tools/mesh-clicker" class="text-accent-600 hover:text-accent-700 font-medium">Mesh → Clicker</NuxtLink>.
      </p>

      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Batas tinggi mesh (mm)</span>
        <div class="flex items-center gap-2">
          <input v-model.number="meshReliefHeightMm" type="range" min="4" max="60" step="1" class="flex-1" />
          <span class="text-xs font-mono w-10 text-right">{{ meshReliefHeightMm }}</span>
        </div>
      </label>
    </div>

    <label v-if="shapeMode !== 'rect'" class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Ukuran maks. (mm)</span>
      <div class="flex items-center gap-2">
        <input v-model.number="maxSizeMm" type="range" min="20" max="80" step="1" class="flex-1" />
        <span class="text-xs font-mono w-10 text-right">{{ maxSizeMm }}</span>
      </div>
      <p class="text-[10px] text-ink-400">Skala artwork 20–80 mm — base menyesuaikan otomatis.</p>
    </label>

    <label class="block space-y-1">
      <span class="text-xs font-medium text-ink-700">Mode tampilan</span>
      <select v-model="displayMode" class="input text-sm">
        <option v-for="d in displayModes" :key="d.id" :value="d.id">{{ d.label }} — {{ d.description }}</option>
      </select>
    </label>

    <label class="flex items-center gap-2 cursor-pointer">
      <input v-model="keyringEnabled" type="checkbox" class="rounded border-ink-300" />
      <span class="text-xs text-ink-700">Tambah loop keyring di base</span>
    </label>

    <div v-if="keyringEnabled" class="space-y-1">
      <span class="text-xs font-medium text-ink-700">Posisi keyring</span>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="pos in keyringPositions"
          :key="pos.id"
          type="button"
          class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
          :class="
            Number(keyringAngleDeg) === pos.angleDeg
              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
              : 'border-ink-200 text-ink-600 hover:border-ink-300'
          "
          :aria-pressed="Number(keyringAngleDeg) === pos.angleDeg"
          @click="keyringAngleDeg = pos.angleDeg"
        >
          {{ pos.label }}
        </button>
      </div>
    </div>
  </div>
</template>
