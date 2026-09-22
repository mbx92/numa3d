<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'Profil Anycubic untuk 3MF'
})

import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  CubeIcon,
  ScissorsIcon,
  ShieldCheckIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'
import { downloadBlob } from '~/utils/downloadBlob.js'
import { parseMaterialColor } from '~/utils/materialColor.js'

const MAX_BYTES = 40 * 1024 * 1024
const toast = useToast()
const fileInput = ref(null)
const selectedFile = ref(null)
const inspection = ref(null)
const inspecting = ref(false)
const converting = ref(false)
const dragging = ref(false)
const errorMessage = ref('')
const materialSelections = ref([])
const activeJob = ref(null)
const sliceResult = ref(null)
const slicing = ref(false)
const sliceError = ref('')
const { data: materials } = useFetch('/api/materials', { server: false, lazy: true })
const { data: slicerStatus } = useFetch('/api/slicer/status', { server: false, lazy: true })
const availableMaterials = computed(() => (materials.value || []).filter((material) =>
  material.type === 'filament' && material.unit === 'gram' && (!material.filamentTypeName || /^PLA/i.test(material.filamentTypeName))))
const materialsReady = computed(() => inspection.value?.compatible
  && materialSelections.value.length === inspection.value.model.colors.length
  && materialSelections.value.every((id) => availableMaterials.value.some((material) => Number(material.id) === Number(id) && Number(material.stockQuantity) > 0))
  && new Set(materialSelections.value.map(Number)).size <= inspection.value.model.maxColors)
const slicedMaterials = computed(() => (sliceResult.value?.materialIds || []).map((id, index) => ({
  id,
  material: availableMaterials.value.find((entry) => Number(entry.id) === Number(id)),
  grams: Number(sliceResult.value?.filamentGrams?.[index] || 0),
  color: sliceResult.value?.colors?.[index] || '#ffffff'
})))
let requestId = 0
let sliceVersion = 0

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDimension(value) {
  return Number(value).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function apiError(error, fallback) {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return `${hours ? `${hours} jam ` : ''}${minutes} menit ${rest} detik`
}

function selectedMaterial(index) {
  const id = Number(materialSelections.value[index])
  return availableMaterials.value.find((material) => Number(material.id) === id) || null
}

function selectedMaterialColor(index, fallback) {
  return parseMaterialColor(selectedMaterial(index)?.color, fallback)
}

function resetSlice() {
  sliceVersion++
  activeJob.value = null
  sliceResult.value = null
  sliceError.value = ''
}

function resetResult() {
  requestId++
  selectedFile.value = null
  inspection.value = null
  materialSelections.value = []
  resetSlice()
  errorMessage.value = ''
  inspecting.value = false
  converting.value = false
  if (fileInput.value) fileInput.value.value = ''
}

async function inspectFile(file) {
  if (!file) return
  const currentRequest = ++requestId
  inspection.value = null
  materialSelections.value = []
  resetSlice()
  errorMessage.value = ''
  if (!/\.3mf$/i.test(file.name || '')) {
    selectedFile.value = null
    errorMessage.value = 'Pilih file dengan format .3mf'
    return
  }
  if (!file.size || file.size > MAX_BYTES) {
    selectedFile.value = null
    errorMessage.value = 'Ukuran file 3MF maksimal 40 MB'
    return
  }
  selectedFile.value = file
  inspecting.value = true
  try {
    const body = new FormData()
    body.append('file', file, file.name)
    const result = await $fetch('/api/tools/3mf-profile/inspect', { method: 'POST', body })
    if (currentRequest !== requestId) return
    inspection.value = result
    materialSelections.value = result.model.colors.map((color) => {
      const match = availableMaterials.value.find((material) => Number(material.stockQuantity) > 0 && parseMaterialColor(material.color, null) === color.toLowerCase())
      return match?.id || ''
    })
    if (result.compatible) toast.success('3MF kompatibel dan siap dikonversi')
  } catch (error) {
    if (currentRequest !== requestId) return
    errorMessage.value = apiError(error, 'Gagal memeriksa file 3MF')
  } finally {
    if (currentRequest === requestId) inspecting.value = false
  }
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  inspectFile(file)
}

function onDrop(event) {
  dragging.value = false
  inspectFile(event.dataTransfer?.files?.[0])
}

async function convertAndDownload() {
  if (!selectedFile.value || !materialsReady.value || converting.value) return
  converting.value = true
  errorMessage.value = ''
  try {
    const body = new FormData()
    body.append('file', selectedFile.value, selectedFile.value.name)
    body.append('materialIds', JSON.stringify(materialSelections.value.map(Number)))
    const blob = await $fetch('/api/tools/3mf-profile/convert', {
      method: 'POST',
      body,
      responseType: 'blob'
    })
    downloadBlob(blob, inspection.value.outputFilename)
    toast.success('3MF profil Anycubic berhasil diunduh')
  } catch (error) {
    errorMessage.value = apiError(error, 'Gagal mengonversi file 3MF')
  } finally {
    converting.value = false
  }
}

async function sliceWithOrca() {
  if (!selectedFile.value || !materialsReady.value || slicing.value) return
  resetSlice()
  const current = sliceVersion
  slicing.value = true
  try {
    const body = new FormData()
    body.append('file', selectedFile.value, selectedFile.value.name)
    body.append('tool', '3mf-profile')
    body.append('includeProfile', 'true')
    body.append('materialIds', JSON.stringify(materialSelections.value.map(Number)))
    let job = await $fetch('/api/slicer/jobs', { method: 'POST', body, retry: 0 })
    if (current !== sliceVersion) return
    activeJob.value = job
    while (current === sliceVersion && ['queued', 'processing'].includes(job.status)) {
      job = await $fetch(`/api/slicer/jobs/${job.id}`, { retry: 0 })
      if (current !== sliceVersion) return
      activeJob.value = job
      if (['queued', 'processing'].includes(job.status)) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    if (current !== sliceVersion) return
    if (job.status !== 'completed' || !job.result) throw new Error(job.error || 'Slicing gagal atau dibatalkan')
    sliceResult.value = job.result
  } catch (error) {
    if (current === sliceVersion) sliceError.value = apiError(error, 'Slicing Orca gagal')
  } finally {
    if (current === sliceVersion) slicing.value = false
  }
}

onUnmounted(() => { requestId++; sliceVersion++ })
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <div>
      <div class="flex items-center gap-1">
        <h1 class="text-xl font-bold">Profil Anycubic untuk 3MF</h1>
        <InfoTooltip label="Informasi konverter profil 3MF">
          Membuat proyek OrcaSlicer bersih untuk Anycubic Kobra X dari file 3MF MakerWorld atau sumber lain.
          File asli tidak diubah.
        </InfoTooltip>
      </div>
      <p class="text-sm text-ink-500 mt-1">
        Pertahankan geometri dan warna aktif, lalu ganti pengaturan cetak dengan profil QR Plate Detail.
      </p>
    </div>

    <div class="grid lg:grid-cols-5 gap-4 items-start">
      <section class="lg:col-span-3 panel overflow-hidden">
        <div class="panel-header">
          <span class="panel-title">File sumber</span>
          <button v-if="selectedFile || errorMessage" type="button" class="btn-secondary text-xs py-1.5 px-2" :disabled="inspecting || converting || slicing" @click="resetResult">
            <XMarkIcon class="w-4 h-4" />Hapus
          </button>
        </div>
        <div class="p-4 space-y-4">
          <label
            class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 cursor-pointer transition-colors text-center"
            :class="dragging ? 'border-accent-400 bg-accent-50/50' : 'border-ink-300 bg-ink-50/60 hover:border-accent-400 hover:bg-accent-50/30'"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <ArrowPathIcon v-if="inspecting" class="w-9 h-9 text-accent-500 animate-spin" />
            <ArrowUpTrayIcon v-else class="w-9 h-9 text-ink-400" />
            <span class="text-sm font-medium text-ink-800">
              {{ inspecting ? 'Memeriksa isi 3MF…' : selectedFile ? selectedFile.name : 'Pilih atau jatuhkan file 3MF' }}
            </span>
            <span class="text-xs text-ink-400">Maksimal 40 MB · satu plate · maksimal empat warna aktif</span>
            <input ref="fileInput" type="file" accept=".3mf,model/3mf" class="sr-only" :disabled="inspecting || converting || slicing" @change="onFileChange" />
          </label>

          <div v-if="errorMessage" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
            {{ errorMessage }}
          </div>

          <div v-if="inspection" class="space-y-3">
            <div
              class="flex items-start gap-2 rounded-lg border px-3 py-2.5"
              :class="inspection.compatible ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'"
            >
              <CheckCircleIcon v-if="inspection.compatible" class="w-5 h-5 shrink-0 mt-0.5" />
              <ShieldCheckIcon v-else class="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p class="text-sm font-semibold">{{ inspection.compatible ? 'Siap dikonversi' : 'Belum dapat dikonversi' }}</p>
                <p v-if="inspection.compatible" class="text-xs mt-0.5">Struktur model valid dan ukurannya muat di area Kobra X.</p>
                <p v-for="issue in inspection.issues" v-else :key="issue" class="text-xs mt-0.5">{{ issue }}</p>
              </div>
            </div>

            <dl class="grid sm:grid-cols-2 gap-2 text-sm">
              <div class="rounded-lg bg-ink-50 px-3 py-2 min-w-0">
                <dt class="text-xs text-ink-400">Nama file</dt>
                <dd class="font-medium truncate" :title="inspection.sourceFilename">{{ inspection.sourceFilename }}</dd>
              </div>
              <div class="rounded-lg bg-ink-50 px-3 py-2">
                <dt class="text-xs text-ink-400">Ukuran file</dt>
                <dd class="font-mono">{{ formatBytes(inspection.sizeBytes) }}</dd>
              </div>
              <div class="rounded-lg bg-ink-50 px-3 py-2">
                <dt class="text-xs text-ink-400">Dimensi model</dt>
                <dd class="font-mono">{{ inspection.model.size.map(formatDimension).join(' × ') }} mm</dd>
              </div>
              <div class="rounded-lg bg-ink-50 px-3 py-2">
                <dt class="text-xs text-ink-400">Isi model</dt>
                <dd>{{ inspection.model.objects }} objek mesh · {{ inspection.model.triangles.toLocaleString('id-ID') }} segitiga</dd>
              </div>
            </dl>

            <div class="rounded-lg bg-ink-50 px-3 py-2">
              <p class="text-xs text-ink-400 mb-1.5">Warna aktif ({{ inspection.model.colors.length }})</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="(color, index) in inspection.model.colors" :key="`${color}-${index}`" class="inline-flex items-center gap-1.5 text-xs font-mono">
                  <span class="w-4 h-4 rounded border border-black/10" :style="{ backgroundColor: color }" />{{ color.toUpperCase() }}
                </span>
              </div>
            </div>

            <div class="rounded-lg border border-ink-200 p-3 space-y-2">
              <div class="flex items-center gap-1">
                <p class="text-sm font-semibold">Material untuk slicing</p>
                <InfoTooltip label="Informasi material slicing">
                  Pilihan ini memetakan setiap warna model ke stok filament PLA dan dipakai untuk rincian gram hasil Orca. Slicing tidak mengurangi stok.
                </InfoTooltip>
              </div>
              <div v-for="(color, index) in inspection.model.colors" :key="`material-${color}-${index}`" class="flex items-center gap-2">
                <span
                  class="w-5 h-5 rounded border border-black/10 shrink-0"
                  :data-testid="`material-color-${index}`"
                  :title="`Warna filament ${selectedMaterialColor(index, color).toUpperCase()}`"
                  :style="{ backgroundColor: selectedMaterialColor(index, color) }"
                />
                <div class="min-w-0 flex-1">
                  <select v-model="materialSelections[index]" class="input" :disabled="slicing" @change="resetSlice">
                    <option value="" disabled>Pilih material untuk {{ color.toUpperCase() }}</option>
                    <option v-for="material in availableMaterials" :key="material.id" :value="material.id" :disabled="Number(material.stockQuantity) <= 0">
                      {{ material.name }} · stok {{ Number(material.stockQuantity).toFixed(1) }} g
                    </option>
                  </select>
                  <p v-if="selectedMaterial(index)" class="mt-1 text-[11px] text-ink-400 font-mono">
                    Model {{ color.toUpperCase() }} → filament {{ selectedMaterialColor(index, color).toUpperCase() }}
                  </p>
                </div>
              </div>
              <p v-if="!availableMaterials.length" class="text-xs text-amber-700">Belum ada filament PLA dalam satuan gram di menu Material.</p>
              <p v-else-if="!materialsReady" class="text-xs text-amber-700">Pilih material yang masih tersedia untuk setiap warna aktif.</p>
              <p class="text-[11px] text-ink-400">Beberapa warna boleh dipetakan ke material yang sama. Warna material terpilih dipakai untuk slot filament pada file download dan slicing Orca.</p>
            </div>
          </div>
        </div>
      </section>

      <aside class="lg:col-span-2 space-y-4">
        <section class="panel overflow-hidden">
          <div class="panel-header"><span class="panel-title">Profil tujuan</span></div>
          <div class="p-4 space-y-3">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-lg bg-accent-500/10 text-accent-600 flex items-center justify-center shrink-0">
                <CubeIcon class="w-5 h-5" />
              </div>
              <div>
                <p class="font-semibold">{{ inspection?.profile.label || 'QR Plate Detail' }}</p>
                <p class="text-xs text-ink-500">Anycubic Kobra X · nozzle 0,4 mm · PLA</p>
              </div>
            </div>
            <dl class="text-sm divide-y divide-ink-100">
              <div class="flex justify-between gap-3 py-2"><dt class="text-ink-500">Layer</dt><dd class="font-mono">0,12 mm</dd></div>
              <div class="flex justify-between gap-3 py-2"><dt class="text-ink-500">Dinding</dt><dd class="font-mono">2 · Arachne</dd></div>
              <div class="flex justify-between gap-3 py-2"><dt class="text-ink-500">Infill</dt><dd class="font-mono">15% gyroid</dd></div>
              <div class="flex justify-between gap-3 py-2"><dt class="text-ink-500">Bed</dt><dd class="text-right">Textured PEI · 60 °C</dd></div>
              <div class="flex justify-between gap-3 py-2"><dt class="text-ink-500">Support</dt><dd class="font-medium text-amber-700">Nonaktif</dd></div>
            </dl>
            <button type="button" class="btn-primary w-full" :disabled="!materialsReady || inspecting || converting || slicing" @click="convertAndDownload">
              <ArrowPathIcon v-if="converting" class="w-4 h-4 animate-spin" />
              <ArrowDownTrayIcon v-else class="w-4 h-4" />
              {{ converting ? 'Mengonversi…' : 'Konversi & download 3MF' }}
            </button>
          </div>
        </section>

        <section class="panel overflow-hidden">
          <div class="panel-header"><span class="panel-title">Slicing Orca</span></div>
          <div class="p-4 space-y-3">
            <p class="text-xs" :class="slicerStatus?.ready ? 'text-emerald-700' : 'text-amber-700'">
              {{ slicerStatus?.message || 'Memeriksa worker OrcaSlicer…' }}
            </p>
            <button type="button" class="btn-primary w-full" :disabled="!materialsReady || inspecting || converting || slicing" @click="sliceWithOrca">
              <ArrowPathIcon v-if="slicing" class="w-4 h-4 animate-spin" />
              <ScissorsIcon v-else class="w-4 h-4" />
              {{ slicing ? (activeJob?.stage || 'Memproses dengan Orca…') : 'Slice gram & waktu' }}
            </button>
            <p v-if="slicerStatus?.ready === false" class="text-[11px] text-amber-700">Job tetap dapat masuk antrean dan diproses ketika worker aktif.</p>
            <NuxtLink v-if="activeJob" :to="`/slicer-queue?job=${activeJob.id}`" class="block text-xs text-accent-700 hover:underline">
              Lihat antrean slicing #{{ activeJob.id }}
            </NuxtLink>
            <p v-if="sliceError" class="text-xs text-red-600" role="alert">{{ sliceError }}</p>
            <div v-if="sliceResult" class="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
              <div>
                <p class="text-lg font-semibold text-emerald-800">{{ Number(sliceResult.totalGrams).toFixed(2) }} g</p>
                <p class="text-xs text-emerald-700">{{ formatDuration(sliceResult.printTimeSeconds) }}</p>
              </div>
              <ul class="space-y-1 text-xs text-ink-600">
                <li v-for="line in slicedMaterials" :key="line.id" class="flex items-center gap-1.5">
                  <span class="w-3.5 h-3.5 rounded-full border border-black/10" :style="{ backgroundColor: line.color }" />
                  <span class="min-w-0 flex-1 truncate">{{ line.material?.name || `Material #${line.id}` }}</span>
                  <span class="font-mono">{{ line.grams.toFixed(2) }} g</span>
                </li>
              </ul>
              <p class="text-[11px] text-ink-500">
                {{ sliceResult.profile }} · {{ sliceResult.bed }}
                <template v-if="sliceResult.primeTower"> · prime tower aktif</template>
                <template v-if="sliceResult.filamentChanges"> · {{ sliceResult.filamentChanges }} pergantian filament</template>
              </p>
              <p v-for="line in slicedMaterials.filter((entry) => entry.material && entry.grams > Number(entry.material.stockQuantity))" :key="`stock-${line.id}`" class="text-xs text-red-600">
                Stok {{ line.material.name }} kurang: perlu {{ line.grams.toFixed(2) }} g, tersedia {{ Number(line.material.stockQuantity).toFixed(2) }} g.
              </p>
            </div>
          </div>
        </section>

        <section class="rounded-panel border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
          <p class="font-semibold mb-1">Periksa kembali di OrcaSlicer</p>
          <p>
            Buka hasil sebagai proyek, lalu tinjau orientasi, support, brim, material, dan preview layer. Profil ini mengutamakan detail permukaan dan bukan jaminan terbaik untuk semua jenis model.
          </p>
        </section>

        <section class="rounded-panel border border-ink-200 bg-white p-3 text-xs text-ink-500 leading-relaxed">
          Pengaturan printer, G-code, post-process, thumbnail, dan lampiran dari file sumber dibuang. Sistem membangun proyek OrcaSlicer baru dari geometri, transformasi, dan warna aktif yang tervalidasi.
        </section>
      </aside>
    </div>
  </div>
</template>
