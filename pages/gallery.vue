<script setup>
import {
  ArrowUpTrayIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ListBulletIcon,
  Squares2X2Icon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
  CursorArrowRaysIcon
} from '@heroicons/vue/24/outline'
import { isMeshClickerFile } from '~/utils/clickerManifold/meshImport.js'

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const { toolLinkAttrs } = useStandaloneDisplay()
const { data: files, refresh: refreshFiles } = await useFetch('/api/library-files')

const search = ref('')
const fileInput = ref(null)
const uploading = ref(false)
const uploadProgress = ref('')
const uploadPercent = ref(0)
const uploadError = ref('')
const previewFile = ref(null)

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
  if (previewFile.value && !rows.some((f) => f.id === previewFile.value.id)) {
    previewFile.value = null
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

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return String(iso)
  }
}

function canMakeClicker(f) {
  return isMeshClickerFile(f)
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

const renameTarget = ref(null)
const renameName = ref('')
const renameSaving = ref(false)
const renameError = ref('')

function stem(name) {
  const raw = String(name || '')
  const i = raw.lastIndexOf('.')
  return i > 0 ? raw.slice(0, i) : raw
}

function openRename(f) {
  renameTarget.value = f
  renameName.value = stem(f.filename)
  renameError.value = ''
}

function closeRename() {
  renameTarget.value = null
  renameName.value = ''
  renameError.value = ''
}

async function saveRename() {
  const f = renameTarget.value
  if (!f) return
  renameSaving.value = true
  renameError.value = ''
  try {
    const updated = await $fetch(`/api/library-files/${f.id}`, {
      method: 'PUT',
      body: { filename: renameName.value }
    })
    await refreshFiles()
    if (previewFile.value?.id === f.id) previewFile.value = { ...previewFile.value, filename: updated.filename }
    closeRename()
    useToast().success('Nama file diubah.')
  } catch (e) {
    renameError.value = e.data?.statusMessage || 'Gagal mengubah nama'
  } finally {
    renameSaving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 min-h-0 h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-3rem)]">
    <div class="flex items-center justify-between gap-2 shrink-0">
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

    <div class="panel flex flex-col flex-1 min-h-0 overflow-hidden">
      <div class="panel-header !flex-wrap gap-2 shrink-0 z-10 bg-white">
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

      <div class="px-3 sm:px-4 pt-3 shrink-0 space-y-3">
        <div class="relative">
          <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input v-model="search" class="input pl-9 w-full" placeholder="Cari nama file…" />
        </div>
        <div v-if="uploading" class="space-y-1.5">
          <div class="flex items-center justify-between gap-2 text-xs text-ink-500">
            <span class="truncate min-w-0">{{ uploadProgress || 'Mengunggah...' }}</span>
            <span class="font-mono shrink-0 tabular-nums">{{ uploadPercent }}%</span>
          </div>
          <div
            class="h-2 rounded-full bg-ink-100 overflow-hidden"
            role="progressbar"
            :aria-valuenow="uploadPercent"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full bg-accent-500 rounded-full transition-[width] duration-150 ease-out"
              :style="{ width: Math.max(uploadPercent, 2) + '%' }"
            />
          </div>
        </div>
        <p v-if="uploadError" class="text-sm text-red-600 whitespace-pre-line">{{ uploadError }}</p>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div v-if="paged.length && filesView === 'list'">
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
                <NuxtLink
                  v-if="canMakeClicker(f)"
                  :to="{ path: '/tools/mesh-clicker', query: { libraryFileId: String(f.id) } }"
                  v-bind="toolLinkAttrs"
                  class="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700"
                  @click.stop
                >
                  <CursorArrowRaysIcon class="w-3.5 h-3.5" />Jadikan clicker
                </NuxtLink>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-800"
                  @click.stop="openRename(f)"
                >
                  <PencilSquareIcon class="w-3.5 h-3.5" />Rename
                </button>
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

        <div v-else-if="paged.length && filesView === 'grid'" class="p-2">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 items-stretch">
            <div
              v-for="f in paged"
              :key="f.id"
              role="button"
              tabindex="0"
              class="min-w-0 h-full flex flex-col text-left rounded-panel border p-2 gap-1.5 transition-colors cursor-pointer"
              :class="previewFile?.id === f.id ? 'border-accent-400 bg-accent-50' : 'border-ink-200 hover:border-ink-300 bg-white'"
              @click="previewFile = f"
              @keydown.enter.prevent="previewFile = f"
            >
              <div
                class="aspect-square w-full rounded border border-ink-100 bg-ink-50 flex items-center justify-center shrink-0"
                :class="previewFile?.id === f.id ? 'border-accent-200' : ''"
              >
                <span class="text-[10px] font-mono font-semibold uppercase tracking-wide text-ink-500">{{ fileExt(f.filename) }}</span>
              </div>
              <div class="font-mono text-[11px] leading-4 h-8 overflow-hidden break-all line-clamp-2">{{ f.filename }}</div>
              <div class="text-[10px] text-ink-400 truncate">{{ formatSize(f.sizeBytes) }}</div>
              <div class="mt-auto flex items-center gap-2 pt-0.5" @click.stop>
                <a
                  :href="`/api/library-files/${f.id}?download=1`"
                  class="text-teal-600 hover:text-teal-700"
                  title="Unduh"
                  aria-label="Unduh"
                >
                  <ArrowDownTrayIcon class="w-3.5 h-3.5" />
                </a>
                <NuxtLink
                  v-if="canMakeClicker(f)"
                  :to="{ path: '/tools/mesh-clicker', query: { libraryFileId: String(f.id) } }"
                  v-bind="toolLinkAttrs"
                  class="text-accent-600 hover:text-accent-700"
                  title="Jadikan clicker"
                  aria-label="Jadikan clicker"
                >
                  <CursorArrowRaysIcon class="w-3.5 h-3.5" />
                </NuxtLink>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="text-ink-600 hover:text-ink-800"
                  title="Rename"
                  aria-label="Rename"
                  @click="openRename(f)"
                >
                  <PencilSquareIcon class="w-3.5 h-3.5" />
                </button>
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
            </div>
          </div>
        </div>

        <p v-else class="p-4 text-sm text-ink-500">
          {{ search.trim() ? 'Tidak ada file yang cocok.' : 'Belum ada file. Upload model 3D tanpa membuat produk.' }}
        </p>
      </div>

      <div v-if="total" class="border-t border-ink-100 shrink-0">
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

    <AppModal v-if="previewFile" :title="previewFile.filename" size="xl" @close="previewFile = null">
      <div class="h-[70vh] -m-4">
        <ClientOnly>
          <ModelViewer
            :key="previewFile.id"
            :src="`/api/library-files/${previewFile.id}`"
            :filename="previewFile.filename"
            class="h-full"
          />
        </ClientOnly>
      </div>
    </AppModal>

    <AppModal v-if="renameTarget" title="Rename file" :nested="!!previewFile" @close="closeRename">
      <form class="space-y-3" @submit.prevent="saveRename">
        <div>
          <label class="label">Nama</label>
          <div class="flex items-center gap-2">
            <input v-model="renameName" class="input flex-1" required maxlength="160" />
            <span class="font-mono text-sm text-ink-500 shrink-0">.{{ fileExt(renameTarget.filename).toLowerCase() }}</span>
          </div>
          <p class="text-xs text-ink-400 mt-1">Ekstensi tidak diubah agar file tetap bisa di-preview.</p>
        </div>
        <p v-if="renameError" class="text-sm text-red-600">{{ renameError }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="closeRename"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary" :disabled="renameSaving">
            <CheckIcon class="w-4 h-4" />{{ renameSaving ? 'Menyimpan…' : 'Simpan' }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
