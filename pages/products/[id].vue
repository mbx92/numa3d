<script setup>
import {
  CheckIcon,
  ArrowUpTrayIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  PlusIcon,
  PhotoIcon,
  ListBulletIcon,
  Squares2X2Icon
} from '@heroicons/vue/24/outline'
import { PRODUCT_STATUSES, productStatusLabel, productStatusClass } from '~/utils/productStatus.js'

const route = useRoute()
const id = route.params.id
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const { data: product, refresh } = await useFetch(`/api/products/${id}`)
const { data: materials } = await useFetch('/api/materials')
const { data: machines } = await useFetch('/api/machines')
const { data: packagingItems } = await useFetch('/api/packaging')
const { data: settings } = await useFetch('/api/settings')
const { data: seriesList } = await useFetch('/api/series')

// Info produk
const info = ref({
  name: product.value?.name,
  description: product.value?.description,
  status: product.value?.status,
  seriesId: product.value?.seriesId ?? null
})
const savingInfo = ref(false)
const currentSeries = computed(() => {
  const sid = Number(info.value.seriesId ?? product.value?.seriesId ?? 0)
  if (!sid) return null
  return (seriesList.value || []).find((s) => Number(s.id) === sid) || null
})
async function saveInfo() {
  savingInfo.value = true
  try {
    await $fetch(`/api/products/${id}`, {
      method: 'PUT',
      body: {
        ...info.value,
        seriesId: info.value.seriesId === '' || info.value.seriesId == null ? null : Number(info.value.seriesId)
      }
    })
    await refresh()
    useToast().success('Info produk tersimpan.')
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menyimpan')
  } finally {
    savingInfo.value = false
  }
}

// Recipe builder (draft lokal, disimpan sekaligus)
const recipeRows = ref(product.value?.recipes?.map((r) => ({ ...r })) || [])
const packRows = ref(product.value?.packaging?.map((p) => ({ ...p })) || [])
const savingRecipe = ref(false)
const savedMsg = ref('')

function addRecipeRow() {
  recipeRows.value.push({
    materialId: materials.value?.[0]?.id || null,
    quantityUsed: 0,
    printTimeMinutes: 0,
    machineId: machines.value?.[0]?.id || null,
    failureRatePercent: 5,
    laborMinutes: 0,
    laborRatePerHour: 0
  })
}
function addPackRow() {
  packRows.value.push({ packagingId: packagingItems.value?.[0]?.id || null, quantityUsed: 1 })
}
async function saveRecipe() {
  savingRecipe.value = true
  savedMsg.value = ''
  await $fetch(`/api/products/${id}/recipe`, {
    method: 'PUT',
    body: { recipes: recipeRows.value, packaging: packRows.value }
  })
  await refresh()
  recipeRows.value = product.value?.recipes?.map((r) => ({ ...r })) || []
  packRows.value = product.value?.packaging?.map((p) => ({ ...p })) || []
  savingRecipe.value = false
  savedMsg.value = 'Recipe tersimpan, HPP diperbarui.'
  setTimeout(() => (savedMsg.value = ''), 3000)
}

// File 3D (disimpan di MinIO, preview via Three.js)
const { data: files, refresh: refreshFiles } = await useFetch(`/api/products/${id}/files`)
const fileInput = ref(null)
const uploading = ref(false)
const uploadProgress = ref('')
const uploadPercent = ref(0)
const uploadError = ref('')
const previewFile = ref(files.value?.[0] || null)

const FILE_VIEW_KEY = 'numa3d-product-files-view'
const filesView = ref('list')
onMounted(() => {
  const saved = localStorage.getItem(FILE_VIEW_KEY)
  if (saved === 'list' || saved === 'grid') filesView.value = saved
})
watch(filesView, (v) => {
  if (import.meta.client) localStorage.setItem(FILE_VIEW_KEY, v)
})

function fileExt(name) {
  return (String(name || '').split('.').pop() || '').toUpperCase()
}

function uploadOneFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    xhr.open('POST', `/api/products/${id}/files`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total)
      else onProgress(0)
    }
    xhr.onload = () => {
      let body = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve(body)
        return
      }
      reject(new Error(body?.statusMessage || body?.message || `Upload gagal (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Koneksi upload gagal'))
    xhr.onabort = () => reject(new Error('Upload dibatalkan'))
    xhr.send(form)
  })
}

async function uploadFile(event) {
  const selected = Array.from(event?.target?.files || fileInput.value?.files || [])
  if (!selected.length) return

  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = ''
  uploadPercent.value = 0
  const errors = []
  let lastUploaded = null
  const total = selected.length

  try {
    for (let i = 0; i < total; i++) {
      const file = selected[i]
      uploadProgress.value =
        total === 1 ? `Mengunggah ${file.name}` : `Mengunggah ${i + 1}/${total}: ${file.name}`
      try {
        lastUploaded = await uploadOneFile(file, (ratio) => {
          uploadPercent.value = Math.min(100, Math.round(((i + ratio) / total) * 100))
        })
        uploadPercent.value = Math.min(100, Math.round(((i + 1) / total) * 100))
      } catch (e) {
        errors.push(`${file.name}: ${e.message || 'gagal'}`)
        uploadPercent.value = Math.min(100, Math.round(((i + 1) / total) * 100))
      }
    }
    await refreshFiles()
    if (lastUploaded) previewFile.value = lastUploaded
    if (errors.length) {
      uploadError.value =
        errors.length === total
          ? `Semua upload gagal.\n${errors.join('\n')}`
          : `${errors.length} dari ${total} file gagal.\n${errors.join('\n')}`
    } else if (total > 1) {
      useToast().success(`${total} file berhasil diunggah.`)
    } else if (total === 1 && lastUploaded) {
      useToast().success(`File "${lastUploaded.filename}" berhasil diunggah.`)
    }
  } finally {
    uploading.value = false
    uploadProgress.value = ''
    uploadPercent.value = 0
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function deleteFile(f) {
  if (!(await useConfirm().confirm(`Hapus file "${f.filename}"?`))) return
  await $fetch(`/api/files/${f.id}`, { method: 'DELETE' })
  if (previewFile.value?.id === f.id) previewFile.value = null
  await refreshFiles()
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

// Harga jual saran
const marginPercent = ref(settings.value?.defaultMarginPercent ?? 40)
const suggested = computed(() => {
  const m = Math.min(Math.max(Number(marginPercent.value) || 0, 0), 95) / 100
  return Math.round((product.value?.hpp || 0) / (1 - m))
})
// Pembulatan ke atas ke Rp 500 / Rp 1.000 terdekat untuk harga "cantik"
const rounded500 = computed(() => Math.ceil(suggested.value / 500) * 500)
const rounded1000 = computed(() => Math.ceil(suggested.value / 1000) * 1000)

const breakdownLabels = {
  materialCost: 'Material',
  failureBuffer: 'Buffer gagal cetak',
  electricityCost: 'Listrik mesin',
  depreciationCost: 'Depresiasi mesin',
  laborCost: 'Tenaga kerja',
  packagingCost: 'Packaging'
}
</script>

<template>
  <div class="space-y-4" v-if="product">
    <div class="flex items-start gap-2 sm:items-center sm:gap-3 flex-wrap">
      <NuxtLink to="/products" class="text-sm text-ink-500 hover:text-accent-600 shrink-0">&larr; Produk</NuxtLink>
      <h1 class="text-lg sm:text-xl font-bold min-w-0 break-words flex-1">{{ product.name }}</h1>
      <span class="badge shrink-0" :class="productStatusClass(product.status)">
        {{ productStatusLabel[product.status] || product.status }}
      </span>
    </div>

    <NuxtLink
      v-if="currentSeries"
      :to="`/catalog/${currentSeries.id}`"
      class="panel flex items-center gap-3 p-3 hover:border-accent-300 hover:shadow-md transition-all"
    >
      <div class="w-12 h-12 sm:w-16 sm:h-16 rounded border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center shrink-0">
        <img v-if="currentSeries.imageKey" :src="`/api/series/${currentSeries.id}/image`" :alt="currentSeries.name" class="w-full h-full object-cover" />
        <PhotoIcon v-else class="w-6 h-6 sm:w-7 sm:h-7 text-ink-300" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] sm:text-xs uppercase tracking-wide text-ink-400 font-semibold">Series</div>
        <div class="font-medium truncate">{{ currentSeries.name }}</div>
        <div v-if="currentSeries.description" class="text-xs text-ink-500 line-clamp-1">{{ currentSeries.description }}</div>
      </div>
      <span class="text-ink-300 text-xs shrink-0 hidden sm:inline">Lihat series →</span>
      <span class="text-ink-300 shrink-0 sm:hidden">→</span>
    </NuxtLink>
    <div v-else-if="isAdmin" class="panel p-3 text-sm text-ink-500">
      Produk ini belum masuk series. Pilih series pada form "Info Produk" di bawah.
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <div class="lg:col-span-4 space-y-3">
        <div class="panel">
          <div class="panel-header"><span class="panel-title">Info Produk</span></div>
          <form class="p-3 sm:p-4 space-y-3" @submit.prevent="saveInfo">
            <div class="flex flex-col sm:flex-row gap-3">
              <ImageUploader
                :src="`/api/products/${id}/image`"
                :has-image="!!product.imageKey"
                :upload-url="`/api/products/${id}/image`"
                :editable="isAdmin"
                size="w-24 h-24"
                @changed="refresh()"
              />
              <p class="text-xs text-ink-500 sm:pt-1">Foto ini yang tampil di halaman Katalog.</p>
            </div>
            <div>
              <label class="label">Nama</label>
              <input v-model="info.name" class="input" required :disabled="!isAdmin" />
            </div>
            <div>
              <label class="label">Deskripsi</label>
              <input v-model="info.description" class="input" :disabled="!isAdmin" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="label">Status</label>
                <select v-model="info.status" class="input" :disabled="!isAdmin">
                  <option v-for="s in PRODUCT_STATUSES" :key="s" :value="s">{{ productStatusLabel[s] }}</option>
                </select>
                <p class="text-xs text-ink-500 mt-1">Draft = kumpulkan data; R&amp;D = riset; Aktif = siap jual.</p>
              </div>
              <div>
                <label class="label">Series</label>
                <select v-model="info.seriesId" class="input" :disabled="!isAdmin">
                  <option value="">— tanpa series —</option>
                  <option v-for="s in seriesList" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
            </div>
            <button v-if="isAdmin" type="submit" class="btn-secondary w-full sm:w-auto" :disabled="savingInfo">
              <CheckIcon class="w-4 h-4" />{{ savingInfo ? 'Menyimpan…' : 'Simpan' }}
            </button>
          </form>
        </div>

        <div class="panel overflow-hidden flex flex-col lg:sticky lg:top-3">
          <div class="panel-header !flex-wrap gap-2 sticky top-0 z-10 bg-white">
            <span class="panel-title">File 3D</span>
            <div class="flex items-center gap-1.5 ml-auto shrink-0">
              <div class="inline-flex rounded-panel border border-ink-200 overflow-hidden">
                <button
                  type="button"
                  class="p-1.5 transition-colors"
                  :class="filesView === 'list' ? 'bg-ink-100 text-ink-800' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'"
                  title="List view"
                  aria-label="List view"
                  @click="filesView = 'list'"
                >
                  <ListBulletIcon class="w-4 h-4" />
                </button>
                <button
                  type="button"
                  class="p-1.5 transition-colors border-l border-ink-200"
                  :class="filesView === 'grid' ? 'bg-ink-100 text-ink-800' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'"
                  title="Grid view"
                  aria-label="Grid view"
                  @click="filesView = 'grid'"
                >
                  <Squares2X2Icon class="w-4 h-4" />
                </button>
              </div>
              <label v-if="isAdmin" class="btn-secondary !py-1 text-xs cursor-pointer shrink-0">
                <ArrowUpTrayIcon class="w-3.5 h-3.5" />{{ uploading ? `${uploadPercent}%` : 'Upload File' }}
                <input
                  ref="fileInput"
                  type="file"
                  accept=".stl,.obj,.3mf,.glb,.gltf"
                  multiple
                  class="hidden"
                  :disabled="uploading"
                  @change="uploadFile"
                />
              </label>
            </div>
          </div>
          <div v-if="uploading" class="px-3 sm:px-4 pt-3 space-y-1.5">
            <div class="flex items-center justify-between gap-2 text-xs text-ink-500">
              <span class="truncate min-w-0">{{ uploadProgress || 'Mengunggah...' }}</span>
              <span class="font-mono shrink-0 tabular-nums">{{ uploadPercent }}%</span>
            </div>
            <div class="h-2 rounded-full bg-ink-100 overflow-hidden" role="progressbar" :aria-valuenow="uploadPercent" aria-valuemin="0" aria-valuemax="100">
              <div
                class="h-full bg-accent-500 rounded-full transition-[width] duration-150 ease-out"
                :style="{ width: Math.max(uploadPercent, 2) + '%' }"
              />
            </div>
          </div>
          <p v-if="uploadError" class="px-3 sm:px-4 pt-3 text-sm text-red-600 whitespace-pre-line">{{ uploadError }}</p>

          <!-- List view -->
          <div v-if="files?.length && filesView === 'list'" class="max-h-[18.75rem] overflow-y-auto overscroll-contain">
            <ul class="divide-y divide-ink-100">
              <li
                v-for="f in files"
                :key="f.id"
                class="p-3 space-y-1 cursor-pointer"
                :class="{ 'bg-accent-50': previewFile?.id === f.id }"
                @click="previewFile = f"
              >
                <div class="font-mono text-sm break-all line-clamp-2">{{ f.filename }}</div>
                <div class="text-xs text-ink-500">
                  {{ formatSize(f.sizeBytes) }} - {{ formatDate(f.createdAt) }}
                </div>
                <div class="flex items-center gap-3 flex-wrap">
                  <span
                    class="inline-flex items-center gap-1 text-xs font-medium"
                    :class="previewFile?.id === f.id ? 'text-accent-700' : 'text-accent-600'"
                  >
                    <EyeIcon class="w-3.5 h-3.5" />{{ previewFile?.id === f.id ? 'Ditampilkan' : 'Preview' }}
                  </span>
                  <a
                    :href="`/api/files/${f.id}?download=1`"
                    class="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700"
                    @click.stop
                  >
                    <ArrowDownTrayIcon class="w-3.5 h-3.5" />Unduh
                  </a>
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"
                    @click.stop="deleteFile(f)"
                  >
                    <TrashIcon class="w-3.5 h-3.5" />Hapus
                  </button>
                </div>
              </li>
            </ul>
          </div>

          <!-- Grid view -->
          <div v-else-if="files?.length && filesView === 'grid'" class="max-h-[18.75rem] overflow-y-auto overscroll-contain p-2">
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="f in files"
                :key="f.id"
                type="button"
                class="text-left rounded-panel border p-2 space-y-1.5 transition-colors"
                :class="previewFile?.id === f.id ? 'border-accent-400 bg-accent-50' : 'border-ink-200 hover:border-ink-300 bg-white'"
                @click="previewFile = f"
              >
                <div
                  class="aspect-square rounded border border-ink-100 bg-ink-50 flex items-center justify-center"
                  :class="previewFile?.id === f.id ? 'border-accent-200' : ''"
                >
                  <span class="text-[10px] font-mono font-semibold uppercase tracking-wide text-ink-500">{{ fileExt(f.filename) }}</span>
                </div>
                <div class="font-mono text-[11px] leading-snug break-all line-clamp-2 min-h-[2rem]">{{ f.filename }}</div>
                <div class="text-[10px] text-ink-400">{{ formatSize(f.sizeBytes) }}</div>
                <div class="flex items-center gap-2 pt-0.5" @click.stop>
                  <a
                    :href="`/api/files/${f.id}?download=1`"
                    class="text-teal-600 hover:text-teal-700"
                    title="Unduh"
                    aria-label="Unduh"
                  >
                    <ArrowDownTrayIcon class="w-3.5 h-3.5" />
                  </a>
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="text-red-500 hover:text-red-700"
                    title="Hapus"
                    aria-label="Hapus"
                    @click="deleteFile(f)"
                  >
                    <TrashIcon class="w-3.5 h-3.5" />
                  </button>
                </div>
              </button>
            </div>
          </div>

          <p v-else class="p-4 text-sm text-ink-500">
            Belum ada file. Upload model 3D (.stl, .obj, .3mf, .glb, .gltf) — bisa pilih banyak file sekaligus, maks 100 MB per file, disimpan di MinIO.
          </p>
        </div>
      </div>

      <div class="panel lg:col-span-8 overflow-hidden">
        <div class="panel-header">
          <span class="panel-title truncate min-w-0">{{ previewFile ? previewFile.filename : 'Preview 3D' }}</span>
        </div>
        <div class="h-[42vh] sm:h-[50vh] lg:h-[70vh]">
          <ClientOnly>
            <ModelViewer
              v-if="previewFile"
              :key="previewFile.id"
              :src="`/api/files/${previewFile.id}`"
              :filename="previewFile.filename"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-sm text-ink-500 bg-ink-50 px-4 text-center">
              Pilih file di panel File 3D untuk melihat preview.
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <div class="panel lg:col-span-8 overflow-hidden">
        <div class="panel-header !flex-wrap gap-2">
          <span class="panel-title">Recipe — Material & Proses</span>
          <button v-if="isAdmin" class="btn-secondary !py-1 text-xs shrink-0" @click="addRecipeRow"><PlusIcon class="w-3.5 h-3.5" />Baris</button>
        </div>
        <div class="p-3 sm:p-4 space-y-3">
          <div v-for="(r, i) in recipeRows" :key="i" class="border border-ink-200 rounded-panel p-3 space-y-3">
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="min-w-0">
                  <label class="label">Material</label>
                  <select v-model="r.materialId" class="input !py-1 w-full" :disabled="!isAdmin">
                    <option v-for="m in materials" :key="m.id" :value="m.id">
                      {{ m.name }} ({{ formatIDR(m.pricePerUnit) }}/{{ m.unit }})
                    </option>
                  </select>
                </div>
                <div class="min-w-0">
                  <label class="label">Mesin</label>
                  <select v-model="r.machineId" class="input !py-1 w-full" :disabled="!isAdmin">
                    <option :value="null">— tanpa mesin —</option>
                    <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.name }}</option>
                  </select>
                </div>
              </div>
              <button
                v-if="isAdmin"
                class="text-red-500 hover:text-red-700 text-lg leading-none px-1 mt-6 shrink-0"
                @click="recipeRows.splice(i, 1)"
              >
                &times;
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <label class="label">Qty</label>
                <input v-model.number="r.quantityUsed" type="number" min="0" step="0.1" class="input-num !py-1 w-full" :disabled="!isAdmin" />
              </div>
              <div>
                <label class="label">Upah/jam</label>
                <IdrInput v-model="r.laborRatePerHour" :disabled="!isAdmin" input-class="!py-1 w-full" />
              </div>
              <div>
                <label class="label">Print (menit)</label>
                <input v-model.number="r.printTimeMinutes" type="number" min="0" class="input-num !py-1 w-full" :disabled="!isAdmin" />
              </div>
              <div>
                <label class="label">Gagal (%)</label>
                <input v-model.number="r.failureRatePercent" type="number" min="0" max="100" step="0.5" class="input-num !py-1 w-full" :disabled="!isAdmin" />
              </div>
              <div>
                <label class="label">Kerja (menit)</label>
                <input v-model.number="r.laborMinutes" type="number" min="0" class="input-num !py-1 w-full" :disabled="!isAdmin" />
              </div>
            </div>
          </div>
          <p v-if="!recipeRows.length" class="text-center text-ink-500 py-4 text-sm">
            Belum ada baris recipe. Klik "+ Baris".
          </p>
        </div>
      </div>

      <div class="panel lg:col-span-4 overflow-hidden">
        <div class="panel-header !flex-wrap gap-2">
          <span class="panel-title">Recipe — Packaging</span>
          <button v-if="isAdmin" class="btn-secondary !py-1 text-xs shrink-0" @click="addPackRow"><PlusIcon class="w-3.5 h-3.5" />Packaging</button>
        </div>
        <div class="p-3 sm:p-4 space-y-2">
          <div v-for="(p, i) in packRows" :key="i" class="flex flex-col sm:flex-row sm:items-center gap-2">
            <select v-model="p.packagingId" class="input !py-1 w-full min-w-0 flex-1" :disabled="!isAdmin">
              <option v-for="pk in packagingItems" :key="pk.id" :value="pk.id">
                {{ pk.name }} ({{ formatIDR(pk.pricePerUnit) }}/{{ pk.unit }})
              </option>
            </select>
            <div class="flex items-center gap-2">
              <input v-model.number="p.quantityUsed" type="number" min="0" step="0.1" class="input-num !py-1 w-full sm:w-24" :disabled="!isAdmin" />
              <button v-if="isAdmin" class="text-red-500 hover:text-red-700 text-lg leading-none px-1 shrink-0" @click="packRows.splice(i, 1)">&times;</button>
            </div>
          </div>
          <p v-if="!packRows.length" class="text-sm text-ink-500">Belum ada packaging.</p>
        </div>
      </div>
    </div>

    <div v-if="isAdmin" class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <button class="btn-primary w-full sm:w-auto" :disabled="savingRecipe" @click="saveRecipe">
        <CheckIcon class="w-4 h-4" />{{ savingRecipe ? 'Menyimpan…' : 'Simpan Recipe & Hitung HPP' }}
      </button>
      <span v-if="savedMsg" class="text-sm text-green-600">{{ savedMsg }}</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div class="panel overflow-hidden">
        <div class="panel-header"><span class="panel-title">Rincian HPP per Unit</span></div>
        <div class="divide-y divide-ink-100">
          <div v-for="(label, key) in breakdownLabels" :key="key" class="px-3 py-2.5 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm">{{ label }}</div>
              <template v-if="key === 'materialCost' && product.materialLines?.length">
                <div v-for="l in product.materialLines" :key="l.materialId" class="text-xs text-ink-400 break-words">
                  {{ l.materialName }}: {{ formatNumber(l.quantityUsed, 1) }} {{ l.unit }} × {{ formatIDR(l.pricePerUnit) }}
                </div>
              </template>
              <template v-if="key === 'packagingCost' && product.packagingLines?.length">
                <div v-for="l in product.packagingLines" :key="l.packagingId" class="text-xs text-ink-400 break-words">
                  {{ l.packagingName }}: {{ formatNumber(l.quantityUsed, 1) }} {{ l.unit }} × {{ formatIDR(l.pricePerUnit) }}
                </div>
              </template>
            </div>
            <div class="num shrink-0 text-sm">{{ formatIDR(product.breakdown?.[key]) }}</div>
          </div>
          <div class="px-3 py-3 flex items-center justify-between gap-3 font-semibold bg-ink-50">
            <span>Total HPP</span>
            <span class="num text-accent-600 text-base">{{ formatIDR(product.hpp) }}</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><span class="panel-title">Harga Jual Saran</span></div>
        <div class="p-3 sm:p-4 space-y-3">
          <div>
            <label class="label">Target margin (%)</label>
            <input v-model.number="marginPercent" type="number" min="0" max="95" class="input-num w-full sm:w-32" />
          </div>
          <div class="text-sm text-ink-600 break-words">
            Harga = HPP ÷ (1 − margin) = {{ formatIDR(product.hpp) }} ÷ (1 − {{ marginPercent }}%)
          </div>
          <div class="text-2xl sm:text-3xl font-mono font-bold text-ink-900 break-all">{{ formatIDR(suggested) }}</div>
          <div class="text-sm text-ink-500 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Dibulatkan:</span>
            <span class="font-mono font-semibold text-teal-600">{{ formatIDR(rounded500) }}</span>
            <span class="text-ink-300 hidden sm:inline">|</span>
            <span class="font-mono font-semibold text-teal-600">{{ formatIDR(rounded1000) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
