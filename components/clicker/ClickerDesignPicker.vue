<script setup>
import {
  SHAPE_MODES,
  DISPLAY_MODES,
  BASE_SHAPES,
  TILE_BASE_SHAPE_IDS,
  KEYRING_POSITIONS,
  glyphCharsFromText,
  syncLetterShapes
} from '~/utils/clickerPresets.js'
import {
  fetchLibraryMeshBuffer,
  isMeshClickerFile
} from '~/utils/clickerManifold/meshImport.js'

const shapeMode = defineModel('shapeMode', { type: String, default: 'rect' })
const baseShape = defineModel('baseShape', { type: String, default: 'outline' })
const perLetterShapes = defineModel('perLetterShapes', { type: Boolean, default: false })
const letterShapes = defineModel('letterShapes', { type: Array, default: () => [] })
const flexiEnabled = defineModel('flexiEnabled', { type: Boolean, default: false })
const flexiConnectionStyle = defineModel('flexiConnectionStyle', { type: String, default: 'hinge' })
const flexiClearanceMm = defineModel('flexiClearanceMm', { type: Number, default: 0.35 })
const flexiStrapHoleMm = defineModel('flexiStrapHoleMm', { type: Number, default: 3.2 })
const text = defineModel('text', { type: String, default: '' })
const fontUrl = defineModel('fontUrl', { type: String, default: '' })
const svgContent = defineModel('svgContent', { type: String, default: '' })
const meshBuffer = defineModel('meshBuffer', { default: null })
const meshFilename = defineModel('meshFilename', { type: String, default: '' })
const meshLibraryFileId = defineModel('meshLibraryFileId', { default: null })
const meshReliefHeightMm = defineModel('meshReliefHeightMm', { type: Number, default: 35 })
const maxSizeMm = defineModel('maxSizeMm', { type: Number, default: 40 })
const displayMode = defineModel('displayMode', { type: String, default: 'preview' })
const snapFitEnabled = defineModel('snapFitEnabled', { type: Boolean, default: false })
const keyringEnabled = defineModel('keyringEnabled', { type: Boolean, default: false })
const keyringStyle = defineModel('keyringStyle', { type: String, default: 'loop' })
const keyringHoleMm = defineModel('keyringHoleMm', { type: Number, default: 5.2 })
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
const { toolLinkAttrs } = useStandaloneDisplay()
const visibleBaseShapes = computed(() => (
  shapeMode.value === 'rect'
    ? baseShapes.filter((s) => TILE_BASE_SHAPE_IDS.includes(s.id))
    : baseShapes
))
const baseShapeLabel = computed(() => {
  if (shapeMode.value !== 'rect') return 'Shape lid'
  return perLetterShapes.value ? 'Shape default / isi semua' : 'Shape semua huruf'
})

const letterTiles = computed(() => glyphCharsFromText(text.value))

function normalizeBaseShape() {
  const availableShapes = visibleBaseShapes.value
  if (!availableShapes.some((shape) => shape.id === baseShape.value)) {
    const preferredShape = shapeMode.value === 'rect' ? 'square' : 'outline'
    baseShape.value = availableShapes.some((shape) => shape.id === preferredShape)
      ? preferredShape
      : availableShapes[0]?.id || 'square'
  }
}

function syncLettersFromText() {
  if (shapeMode.value !== 'rect') {
    letterShapes.value = []
    return
  }
  letterShapes.value = syncLetterShapes(text.value, letterShapes.value, baseShape.value)
}

function applyBaseShapeToAllLetters() {
  if (shapeMode.value !== 'rect' || !perLetterShapes.value) return
  const chars = glyphCharsFromText(text.value)
  letterShapes.value = chars.map(() => baseShape.value)
}

function setLetterShape(index, shapeId) {
  const next = syncLetterShapes(text.value, letterShapes.value, baseShape.value)
  if (index < 0 || index >= next.length) return
  next[index] = shapeId
  letterShapes.value = next
}

watch(shapeMode, (mode) => {
  if (mode === 'rect' && baseShape.value === 'outline') baseShape.value = 'square'
  if (mode !== 'rect') {
    perLetterShapes.value = false
    letterShapes.value = []
  }
  normalizeBaseShape()
  syncLettersFromText()
}, { immediate: true })

watch(baseShape, () => {
  normalizeBaseShape()
  if (perLetterShapes.value) applyBaseShapeToAllLetters()
  else syncLettersFromText()
})

watch(text, () => {
  syncLettersFromText()
})

watch(perLetterShapes, (enabled) => {
  if (enabled) {
    syncLettersFromText()
    if (!letterShapes.value.length) applyBaseShapeToAllLetters()
  }
})

watch([shapeMode, flexiEnabled], ([mode, flexi]) => {
  if (mode !== 'rect' || flexi) {
    keyringEnabled.value = false
    snapFitEnabled.value = false
  }
}, { immediate: true })

watch([shapeMode, keyringEnabled], ([mode, keyring]) => {
  if (mode === 'rect' && keyring) flexiEnabled.value = false
})

watch([shapeMode, snapFitEnabled], ([mode, snap]) => {
  if (mode === 'rect' && snap) flexiEnabled.value = false
})

watch(letterTiles, (tiles) => {
  if (tiles.length < 2) snapFitEnabled.value = false
})

const showSnapFitOption = computed(() => (
  shapeMode.value === 'rect'
  && !flexiEnabled.value
  && letterTiles.value.length >= 2
))

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
      <div
        class="grid gap-1 mt-1.5"
        :class="shapeMode === 'rect' ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6'"
      >
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
        {{
          shapeMode === 'rect'
            ? (perLetterShapes
              ? 'Pilih di atas untuk default / isi semua huruf. Atur per huruf di bawah.'
              : 'Setiap huruf memakai shape yang sama (bisa diubah per huruf).')
            : 'Outline mengikuti siluet desain; shape lain membungkus artwork.'
        }}
      </p>
    </div>

    <div v-if="shapeMode === 'rect'" class="space-y-2 rounded-lg border border-ink-200 p-3">
      <label class="flex items-center gap-2 text-xs font-medium text-ink-700 cursor-pointer">
        <input v-model="perLetterShapes" type="checkbox" class="rounded border-ink-300 text-accent-600" />
        Shape berbeda per huruf
      </label>
      <template v-if="perLetterShapes">
        <div v-if="!letterTiles.length" class="text-[11px] text-ink-500">Isi teks lid dulu untuk mengatur shape per huruf.</div>
        <div v-else class="space-y-1.5">
          <div
            v-for="(ch, i) in letterTiles"
            :key="`${ch}-${i}`"
            class="flex items-center gap-2"
          >
            <span class="w-6 text-center text-xs font-bold text-ink-800">{{ ch }}</span>
            <div class="grid flex-1 grid-cols-3 gap-1">
              <button
                v-for="s in visibleBaseShapes"
                :key="s.id"
                type="button"
                class="flex items-center justify-center rounded-md border p-1.5 transition-colors aspect-square"
                :class="
                  (letterShapes[i] || baseShape) === s.id
                    ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
                    : 'border-ink-200 hover:border-ink-300 text-ink-600'
                "
                :title="`${ch}: ${s.label}`"
                :aria-label="`${ch} ${s.label}`"
                :aria-pressed="(letterShapes[i] || baseShape) === s.id"
                @click="setLetterShape(i, s.id)"
              >
                <ClickerBaseShapeIcon :shape="s.id" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template v-if="shapeMode === 'rect' || shapeMode === 'text'">
      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Teks lid</span>
        <input v-model="text" class="input text-sm font-semibold" maxlength="16" placeholder="CLICK" />
      </label>
      <KeychainFontPicker v-model="fontUrl" :preview-text="text || 'CLICK'" :show-downloader-link="false" />
    </template>

    <div v-if="shapeMode === 'rect'" class="space-y-2 rounded-lg border border-ink-200 p-3">
      <label class="flex items-center gap-2 text-xs font-medium text-ink-700">
        <input v-model="flexiEnabled" type="checkbox" class="rounded border-ink-300 text-accent-600" />
        Sambungan flexi antar huruf
      </label>
      <p class="text-[11px] text-ink-500">
        {{ flexiConnectionStyle === 'strap' ? 'Base dicetak terpisah dengan tunnel tali sisi-ke-sisi di tengah atas–bawah base, di bawah cavity switch.' : 'Engsel pada base tercetak saling terkait dan bisa ditekuk kiri–kanan.' }}
        Lid tetap dapat ditekan sendiri-sendiri.
      </p>
      <template v-if="flexiEnabled">
        <div class="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
            :class="
              flexiConnectionStyle === 'hinge'
                ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
                : 'border-ink-200 text-ink-600 hover:border-ink-300'
            "
            :aria-pressed="flexiConnectionStyle === 'hinge'"
            @click="flexiConnectionStyle = 'hinge'"
          >
            Engsel
          </button>
          <button
            type="button"
            class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
            :class="
              flexiConnectionStyle === 'strap'
                ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
                : 'border-ink-200 text-ink-600 hover:border-ink-300'
            "
            :aria-pressed="flexiConnectionStyle === 'strap'"
            @click="flexiConnectionStyle = 'strap'"
          >
            Lubang tali
          </button>
        </div>
        <label v-if="flexiConnectionStyle === 'hinge'" class="block space-y-1">
          <span class="text-xs font-medium text-ink-700">Celah engsel (mm)</span>
          <input v-model.number="flexiClearanceMm" type="number" min="0.2" max="0.6" step="0.05" class="input-num w-full text-sm" />
        </label>
        <label v-else class="block space-y-1">
          <span class="text-xs font-medium text-ink-700">Diameter lubang tali (mm)</span>
          <input v-model.number="flexiStrapHoleMm" type="number" min="2.5" max="5" step="0.1" class="input-num w-full text-sm" />
        </label>
        <p class="text-[11px] text-ink-500">
          {{ flexiConnectionStyle === 'strap' ? 'Gunakan minimal 2 huruf. Setelah cetak, masukkan tali menembus tunnel kiri–kanan yang sejajar di tengah tiap base.' : 'Gunakan minimal 2 huruf. Cetak base bersama dalam posisi datar; jangan pisahkan bagian engsel di slicer.' }}
        </p>
      </template>
    </div>

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
        <NuxtLink to="/tools/mesh-clicker" v-bind="toolLinkAttrs" class="text-accent-600 hover:text-accent-700 font-medium">Mesh → Clicker</NuxtLink>.
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

    <label v-if="showSnapFitOption" class="flex items-start gap-2 cursor-pointer">
      <input v-model="snapFitEnabled" type="checkbox" class="mt-0.5 rounded border-ink-300" />
      <span class="text-xs text-ink-700 leading-snug">
        <span class="font-medium">Clip kunci antar shape</span>
        <span class="block text-[11px] text-ink-500 mt-0.5">
          Base terpisah; lock di bagian bawah: rail + latch klik. Setelah cetak geser sampai klik — tekan latch untuk lepas. Tidak digabung dengan flexi.
        </span>
      </span>
    </label>

    <label v-if="shapeMode === 'rect' && !flexiEnabled" class="flex items-center gap-2 cursor-pointer">
      <input v-model="keyringEnabled" type="checkbox" class="rounded border-ink-300" />
      <span class="text-xs text-ink-700">Tambah gantungan / loop keyring</span>
    </label>

    <div v-if="shapeMode === 'rect' && !flexiEnabled && keyringEnabled" class="space-y-1">
      <p class="text-[11px] text-ink-500 rounded-md bg-ink-50 border border-ink-100 px-2 py-1.5">
        Loop atau lubang tali di sisi base untuk digantung. Opsional bersama clip kunci — bukan mekanisme kunci antar huruf.
      </p>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
          :class="
            keyringStyle === 'loop'
              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
              : 'border-ink-200 text-ink-600 hover:border-ink-300'
          "
          :aria-pressed="keyringStyle === 'loop'"
          @click="keyringStyle = 'loop'"
        >
          Loop
        </button>
        <button
          type="button"
          class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
          :class="
            keyringStyle === 'hole'
              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200 text-accent-700'
              : 'border-ink-200 text-ink-600 hover:border-ink-300'
          "
          :aria-pressed="keyringStyle === 'hole'"
          @click="keyringStyle = 'hole'"
        >
          Lubang tali
        </button>
      </div>
      <label class="block space-y-1">
        <span class="text-xs font-medium text-ink-700">Diameter lubang (mm)</span>
        <input v-model.number="keyringHoleMm" type="number" min="3" max="8" step="0.1" class="input-num w-full text-sm" />
      </label>
      <span class="text-xs font-medium text-ink-700">{{ snapFitEnabled && letterTiles.length >= 2 ? 'Posisi gantungan (ujung rantai)' : 'Posisi gantungan' }}</span>
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
