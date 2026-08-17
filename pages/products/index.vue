<script setup>
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  PhotoIcon
} from '@heroicons/vue/24/outline'

const { data: products, refresh } = await useFetch('/api/products')
const { data: seriesList } = await useFetch('/api/series')
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const statusBadge = {
  rnd: 'bg-ink-200 text-ink-600',
  active: 'bg-green-100 text-green-700',
  discontinued: 'bg-ink-100 text-ink-400 line-through'
}
const statusLabel = { rnd: 'R&D', active: 'Aktif', discontinued: 'Discontinued' }

const search = ref('')
const statusFilter = ref('')
const filteredProducts = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (products.value || []).filter((p) => {
    if (statusFilter.value && p.status !== statusFilter.value) return false
    if (!q) return true
    return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
  })
})
const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  filteredProducts,
  10
)
watch([search, statusFilter], reset)

const showForm = ref(false)
const form = ref({})
const errorMsg = ref('')

function openAdd() {
  form.value = { name: '', description: '', status: 'rnd', seriesId: '' }
  errorMsg.value = ''
  showForm.value = true
}
async function save() {
  errorMsg.value = ''
  try {
    const p = await $fetch('/api/products', { method: 'POST', body: form.value })
    showForm.value = false
    await navigateTo(`/products/${p.id}`)
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  }
}
async function remove(p) {
  if (!(await useConfirm().confirm(`Hapus produk "${p.name}"? Recipe-nya ikut terhapus.`))) return
  try {
    await $fetch(`/api/products/${p.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Produk &amp; HPP</h1>
      <button v-if="isAdmin" class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Tambah Produk</span><span class="sm:hidden">Tambah</span>
      </button>
    </div>

    <div class="flex flex-col sm:flex-row flex-wrap gap-2">
      <div class="relative w-full sm:flex-1 sm:min-w-[12rem] md:max-w-xs">
        <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <input
          v-model="search"
          class="input pl-9 w-full"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          placeholder="Cari nama atau deskripsi…"
        />
      </div>
      <select v-model="statusFilter" class="input w-full sm:w-40">
        <option value="">Semua status</option>
        <option value="rnd">R&amp;D</option>
        <option value="active">Aktif</option>
        <option value="discontinued">Discontinued</option>
      </select>
    </div>

    <!-- Tabel (desktop) -->
    <div class="panel hidden md:block">
      <div class="overflow-x-auto">
        <table class="table-std">
          <thead>
            <tr>
              <th class="w-14"></th>
              <th>Produk</th>
              <th>Status</th>
              <th class="text-right">HPP / unit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in paged" :key="p.id">
              <td>
                <div class="w-10 h-10 rounded border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center">
                  <img v-if="p.imageKey" :src="`/api/products/${p.id}/image`" alt="" class="w-full h-full object-cover" />
                  <PhotoIcon v-else class="w-4 h-4 text-ink-300" />
                </div>
              </td>
              <td>
                <NuxtLink :to="`/products/${p.id}`" class="font-medium text-ink-900 hover:text-accent-600">
                  {{ p.name }}
                </NuxtLink>
                <div v-if="p.description" class="text-xs text-ink-400">{{ p.description }}</div>
              </td>
              <td><span class="badge" :class="statusBadge[p.status]">{{ statusLabel[p.status] }}</span></td>
              <td class="num">
                <span v-if="p.hasRecipe">{{ formatIDR(p.hpp) }}</span>
                <span v-else class="text-ink-400 text-xs">belum ada recipe</span>
              </td>
              <td class="whitespace-nowrap text-right">
                <NuxtLink :to="`/products/${p.id}`" class="btn-secondary !py-1 !px-2 text-xs">
                  <PencilSquareIcon class="w-3.5 h-3.5" />{{ isAdmin ? 'Recipe & HPP' : 'Lihat' }}
                </NuxtLink>
                <button v-if="isAdmin" class="btn-danger !py-1 !px-2 text-xs ml-1" @click="remove(p)">
                  <TrashIcon class="w-3.5 h-3.5" />Hapus
                </button>
              </td>
            </tr>
            <tr v-if="!total">
              <td colspan="5" class="text-center text-ink-500 py-6">
                {{ search || statusFilter ? 'Tidak ada produk yang cocok.' : 'Belum ada produk.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination
        v-model:page="page"
        v-model:pageSize="pageSize"
        :total-pages="totalPages"
        :total="total"
        :range-start="rangeStart"
        :range-end="rangeEnd"
      />
    </div>

    <!-- Kartu (mobile) -->
    <div class="md:hidden space-y-2">
      <div v-for="p in paged" :key="p.id" class="panel p-3 flex gap-3">
        <NuxtLink
          :to="`/products/${p.id}`"
          class="w-14 h-14 rounded border border-ink-200 bg-ink-50 overflow-hidden shrink-0 flex items-center justify-center"
        >
          <img v-if="p.imageKey" :src="`/api/products/${p.id}/image`" alt="" class="w-full h-full object-cover" />
          <PhotoIcon v-else class="w-5 h-5 text-ink-300" />
        </NuxtLink>
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-start justify-between gap-2">
            <NuxtLink :to="`/products/${p.id}`" class="font-medium break-words hover:text-accent-600">{{ p.name }}</NuxtLink>
            <span class="badge shrink-0" :class="statusBadge[p.status]">{{ statusLabel[p.status] }}</span>
          </div>
          <div class="text-sm font-mono">
            <span v-if="p.hasRecipe">HPP {{ formatIDR(p.hpp) }}</span>
            <span v-else class="text-ink-400 text-xs">belum ada recipe</span>
          </div>
          <div class="flex flex-wrap gap-1 pt-1">
            <NuxtLink :to="`/products/${p.id}`" class="btn-secondary !py-1 !px-2 text-xs">
              <PencilSquareIcon class="w-3.5 h-3.5" />{{ isAdmin ? 'Recipe & HPP' : 'Lihat' }}
            </NuxtLink>
            <button v-if="isAdmin" class="btn-danger !py-1 !px-2 text-xs" @click="remove(p)">
              <TrashIcon class="w-3.5 h-3.5" />Hapus
            </button>
          </div>
        </div>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">
        {{ search || statusFilter ? 'Tidak ada produk yang cocok.' : 'Belum ada produk.' }}
      </p>
      <div v-else class="panel">
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

    <AppModal v-if="showForm" title="Tambah Produk" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="save">
        <div>
          <label class="label">Nama</label>
          <input v-model="form.name" class="input" required placeholder="Vas Bunga Spiral" />
        </div>
        <div>
          <label class="label">Deskripsi</label>
          <input v-model="form.description" class="input" placeholder="opsional" />
        </div>
        <div>
          <label class="label">Status</label>
          <select v-model="form.status" class="input">
            <option value="rnd">R&amp;D</option>
            <option value="active">Aktif</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>
        <div>
          <label class="label">Series katalog</label>
          <select v-model="form.seriesId" class="input">
            <option value="">— tanpa series —</option>
            <option v-for="s in seriesList" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <p class="text-xs text-ink-500">Foto produk bisa ditambahkan setelah ini, di halaman detail produk.</p>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan &amp; Buat Recipe</button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
