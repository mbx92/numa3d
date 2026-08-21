<script setup>
import {
  ArrowUpTrayIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ListBulletIcon,
  Squares2X2Icon,
  MagnifyingGlassIcon
} from '@heroicons/vue/24/outline'

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const { data: files, refresh: refreshFiles } = await useFetch('/api/library-files')

const search = ref('')
const fileInput = ref(null)
const uploading = ref(false)
const uploadProgress = ref('')
const uploadPercent = ref(0)
const uploadError = ref('')
const previewFile = ref(files.value?.[0] || null)

const FILE_VIEW_KEY = 'numa3d-library-files-view'
const filesView = ref('grid')
onMounted(() => {
  const saved = localStorage.getItem(FILE_VIEW_KEY)
  if (saved === 'list' || saved === 'grid') filesView.value = saved
})
watch(filesView, (v) => {
  if (import.meta.client) localStorage.setItem(FILE_VIEW_KEY, v)
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const rows = files.value || []
  if (!q) return rows
  return rows.filter((f) => String(f.filename || '').toLowerCase().includes(q))
})
const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(filtered, 24)
watch(search, reset)

watch(filtered, (rows) => {
  if (!rows.length) {
    previewFile.value = null
    return
  }
  if (!previewFile.value || !rows.some((f) => f.id === previewFile.value.id)) {
    previewFile.value = rows[0]
  }
})

function fileExt(name) {
  return (String(name || '').split('.').pop() || '').toUpperCase()
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

function uploadOneFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    xhr.open('POST', '/api/library-files')
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
  const totalFiles = selected.length

  try {
    for (let i = 0; i < totalFiles; i++) {
      const file = selected[i]
      uploadProgress.value =
        totalFiles === 1 ? `Mengunggah ${file.name}` : `Mengunggah ${i + 1}/${totalFiles}: ${file.name}`
      try {
        lastUploaded = await uploadOneFile(file, (ratio) => {
          uploadPercent.value = Math.min(100, Math.round(((i + ratio) / totalFiles) * 100))
        })
        uploadPercent.value = Math.min(100, Math.round(((i + 1) / totalFiles) * 100))
      } catch (e) {
        errors.push(`${file.name}: ${e.message || 'gagal'}`)
        uploadPercent.value = Math.min(100, Math.round(((i + 1) / totalFiles) * 100))
      }
    }
    await refreshFiles()
    if (lastUploaded) previewFile.value = lastUploaded
    if (errors.length) {
      uploadError.value =
        errors.length === totalFiles
          ? `Semua upload gagal.\n${errors.join('\n')}`
          : `${errors.length} dari ${totalFiles} file gagal.\n${errors.join('\n')}`
    } else if (totalFiles > 1) {
      useToast().success(`${totalFiles} file berhasil diunggah.`)
    } else if (totalFiles === 1 && lastUploaded) {
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
  try {
    await $fetch(`/api/library-files/${f.id}`, { method: 'DELETE' })
    if (previewFile.value?.id === f.id) previewFile.value = null
    await refreshFiles()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <h1 class="text-xl font-bold">Galeri 3D</h1>
        <p class="text-sm text-ink-500">Model lepas, tidak terikat produk. .stl .obj .3mf .glb .gltf, maks 100 MB.</p>
      </div>
      <label v-if="isAdmin" class="btn-primary cursor-pointer shrink-0">
        <ArrowUpTrayIcon class="w-4 h-4" />
        {{ uploading ? `${uploadPercent}%` : 'Upload' }}
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

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <div class="lg:col-span-4">
        <div class="panel overflow-hidden flex flex-col lg:sticky lg:top-3">
          <div class="panel-header !flex-wrap gap-2 sticky top-0 z-10 bg-white">
            <span class="panel-title">{{ total }} file</span>
            <div class="inline-flex rounded-panel border border-ink-200 overflow-hidden ml-auto">
              <button
                type="button"
                class="p-1.5 transition-colors"
                :class="filesView === 'list' ? 'bg-ink-100 text-ink-800' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'"
                title="List"
                aria-label="List"
                @click="filesView = 'list'"
              >
                <ListBulletIcon class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 transition-colors border-l border-ink-200"
                :class="filesView === 'grid' ? 'bg-ink-100 text-ink-800' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'"
                title="Grid"
                aria-label="Grid"
                @click="filesView = 'grid'"
              >
                <Squares2X2Icon class="w-4 h-4" />
              </button>
            </div>
          </div>
          <div class="px-3 sm:px-4 pt-3">
            <div class="relative">
              <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <input v-model="search" class="input pl-9 w-full" placeholder="Cari nama file…" />
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

          <div v-if="paged.length && filesView === 'list'" class="max-h-[18.75rem] lg:max-h-[28rem] overflow-y-auto overscroll-contain">
            <ul class="divide-y divide-ink-100">
              <li
                v-for="f in paged"
                :key="f.id"
                class="p-3 space-y-1 cursor-pointer"
                :class="{ 'bg-accent-50': previewFile?.id === f.id }"
                @click="previewFile = f"
              >
                <div class="font-mono text-sm break-all line-clamp-2">{{ f.filename }}</div>
                <div class="text-xs text-ink-500">{{ formatSize(f.sizeBytes) }} · {{ formatDate(f.createdAt) }}</div>
                <div class="flex items-center gap-3 flex-wrap">
                  <span
                    class="inline-flex items-center gap-1 text-xs font-medium"
                    :class="previewFile?.id === f.id ? 'text-accent-700' : 'text-accent-600'"
                  >
                    <EyeIcon class="w-3.5 h-3.5" />{{ previewFile?.id === f.id ? 'Ditampilkan' : 'Preview' }}
                  </span>
                  <a
                    :href="`/api/library-files/${f.id}?download=1`"
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

          <div v-else-if="paged.length && filesView === 'grid'" class="max-h-[18.75rem] lg:max-h-[28rem] overflow-y-auto overscroll-contain p-2">
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="f in paged"
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
                    :href="`/api/library-files/${f.id}?download=1`"
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
            {{ search.trim() ? 'Tidak ada file yang cocok.' : 'Belum ada file. Upload model 3D tanpa membuat produk.' }}
          </p>

          <div v-if="total" class="border-t border-ink-100">
            <AppPagination
              v-model:page="page"
              v-model:pageSize="pageSize"
              :total-pages="totalPages"
              :total="total"
              :range-start="rangeStart"
              :range-end="rangeEnd"
            />
          </div>
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
              :src="`/api/library-files/${previewFile.id}`"
              :filename="previewFile.filename"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-sm text-ink-500 bg-ink-50 px-4 text-center">
              Pilih file di galeri untuk melihat preview.
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
