<script setup>
import { MagnifyingGlassIcon, PhotoIcon, PencilSquareIcon, PlusIcon, TrashIcon, XMarkIcon, CheckIcon } from '@heroicons/vue/24/outline'

const { data: series, refresh } = await useFetch('/api/series')
// Daftar series untuk halaman Katalog (/catalog).
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return series.value || []
  return (series.value || []).filter(
    (s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
  )
})

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(filtered, 12)
watch(search, reset)

const showForm = ref(false)
const editing = ref(null)
const form = ref({})
const errorMsg = ref('')

function openAdd() {
  editing.value = null
  form.value = { name: '', description: '' }
  errorMsg.value = ''
  showForm.value = true
}
function openEdit(s) {
  editing.value = s
  form.value = { name: s.name, description: s.description || '' }
  errorMsg.value = ''
  showForm.value = true
}
async function save() {
  errorMsg.value = ''
  try {
    if (editing.value) {
      await $fetch(`/api/series/${editing.value.id}`, { method: 'PUT', body: form.value })
      showForm.value = false
      await refresh()
    } else {
      const created = await $fetch('/api/series', { method: 'POST', body: form.value })
      editing.value = created
      await refresh()
      useToast().success('Series tersimpan. Tambahkan sampul bila perlu.')
      return
    }
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  }
}
async function remove(s) {
  if (!(await useConfirm().confirm(`Hapus series "${s.name}"? Produk di dalamnya tidak ikut terhapus.`))) return
  try {
    await $fetch(`/api/series/${s.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Katalog</h1>
      <div class="flex items-center gap-2">
        <button v-if="isAdmin" class="btn-primary" @click="openAdd">
          <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Tambah Series</span><span class="sm:hidden">Series</span>
        </button>
        <NuxtLink to="/products" class="btn-secondary text-sm">
          <PencilSquareIcon class="w-4 h-4" /><span class="hidden sm:inline">Kelola Produk</span><span class="sm:hidden">Produk</span>
        </NuxtLink>
      </div>
    </div>

    <div class="relative max-w-xs">
      <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input v-model="search" class="input pl-9" placeholder="Cari series…" />
    </div>

    <div v-if="total" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <NuxtLink
        v-for="s in paged"
        :key="s.id"
        :to="`/catalog/${s.id}`"
        class="panel overflow-hidden flex flex-col hover:border-accent-300 hover:shadow-md transition-all"
      >
        <div class="aspect-[4/3] bg-ink-100 flex items-center justify-center overflow-hidden relative">
          <img v-if="s.imageKey" :src="`/api/series/${s.id}/image`" :alt="s.name" class="w-full h-full object-cover" />
          <PhotoIcon v-else class="w-10 h-10 text-ink-300" />
          <span class="absolute bottom-2 right-2 badge bg-ink-900/70 text-ink-100">
            {{ s.productCount }} produk
          </span>
        </div>
        <div class="p-3 flex-1 flex flex-col gap-1.5">
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium leading-snug break-words">{{ s.name }}</span>
            <div v-if="isAdmin" class="flex gap-1 shrink-0" @click.prevent>
              <button class="btn-secondary !py-1 !px-1.5 text-xs" title="Edit" @click="openEdit(s)">
                <PencilSquareIcon class="w-3.5 h-3.5" />
              </button>
              <button class="btn-danger !py-1 !px-1.5 text-xs" title="Hapus" @click="remove(s)">
                <TrashIcon class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p v-if="s.description" class="text-xs text-ink-400 line-clamp-2">{{ s.description }}</p>
          <p v-else class="text-xs text-ink-300 italic">Tanpa deskripsi</p>
        </div>
      </NuxtLink>
    </div>

    <p v-else class="panel p-10 text-center text-sm text-ink-500">
      {{ search ? 'Tidak ada series yang cocok.' : 'Belum ada series. Klik "Tambah Series" untuk memulai.' }}
    </p>

    <div v-if="total" class="panel">
      <AppPagination
        v-model:page="page"
        v-model:pageSize="pageSize"
        :total-pages="totalPages"
        :total="total"
        :range-start="rangeStart"
        :range-end="rangeEnd"
        :page-size-options="[12, 24, 48]"
      />
    </div>

    <p v-if="isAdmin" class="text-xs text-ink-500">
      Klik kartu series untuk membuka isinya, lalu gunakan tombol "Tambah Produk" di halaman itu.
    </p>

    <AppModal v-if="showForm" :title="editing ? 'Edit Series' : 'Tambah Series'" @close="((showForm = false), refresh())">
      <form class="space-y-3" @submit.prevent="save">
        <div v-if="editing" class="flex gap-4 items-start">
          <ImageUploader
            :src="`/api/series/${editing.id}/image`"
            :has-image="!!editing.imageKey"
            :upload-url="`/api/series/${editing.id}/image`"
            @changed="refresh()"
          />
          <p class="text-xs text-ink-500 pt-1">Sampul ini tampil di kartu series pada halaman Katalog.</p>
        </div>
        <div>
          <label class="label">Nama Series</label>
          <input v-model="form.name" class="input" required placeholder="Contoh: Vas Dekoratif" />
        </div>
        <div>
          <label class="label">Deskripsi</label>
          <input v-model="form.description" class="input" placeholder="opsional" />
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="((showForm = false), refresh())">
            <XMarkIcon class="w-4 h-4" />{{ editing ? 'Tutup' : 'Batal' }}
          </button>
          <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan</button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
