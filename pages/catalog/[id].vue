<script setup>
import { PhotoIcon, ArrowLeftIcon, PlusIcon, XMarkIcon, CheckIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import { productStatusLabel, productStatusBadge } from '~/utils/productStatus.js'

const route = useRoute()
const id = route.params.id
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const { data: series, refresh } = await useFetch(`/api/series/${id}`)
const { data: allProducts } = await useFetch('/api/products')

const statusBadge = productStatusBadge
const statusLabel = productStatusLabel

const showAdd = ref(false)
const search = ref('')
const selected = ref([])
const saving = ref(false)
const errorMsg = ref('')

const available = computed(() => {
  const inSeries = new Set((series.value?.products || []).map((p) => p.id))
  const q = search.value.trim().toLowerCase()
  return (allProducts.value || []).filter((p) => {
    if (inSeries.has(p.id)) return false
    if (!q) return true
    return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
  })
})

function openAdd() {
  selected.value = []
  search.value = ''
  errorMsg.value = ''
  showAdd.value = true
}
function toggle(pid) {
  const i = selected.value.indexOf(pid)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(pid)
}
async function addSelected() {
  if (!selected.value.length) return
  saving.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/series/${id}/products`, { method: 'POST', body: { productIds: selected.value } })
    showAdd.value = false
    await refresh()
    useToast().success(`${selected.value.length} produk ditambahkan ke series.`)
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menambahkan produk'
  } finally {
    saving.value = false
  }
}
async function removeFromSeries(p) {
  if (!(await useConfirm().confirm(`Lepas "${p.name}" dari series ini?`))) return
  try {
    await $fetch(`/api/series/${id}/products/${p.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal melepas produk')
  }
}
</script>

<template>
  <div class="space-y-4" v-if="series">
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-3 flex-wrap">
        <NuxtLink to="/catalog" class="text-sm text-ink-500 hover:text-accent-600 flex items-center gap-1">
          <ArrowLeftIcon class="w-4 h-4" />Katalog
        </NuxtLink>
        <h1 class="text-xl font-bold">{{ series.name }}</h1>
        <span class="badge bg-ink-100 text-ink-600">{{ series.products?.length || 0 }} produk</span>
      </div>
      <button v-if="isAdmin" class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" />Tambah Produk
      </button>
    </div>

    <div class="flex gap-3 items-start">
      <div class="w-24 h-24 rounded-panel border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center shrink-0">
        <img v-if="series.imageKey" :src="`/api/series/${series.id}/image`" :alt="series.name" class="w-full h-full object-cover" />
        <PhotoIcon v-else class="w-8 h-8 text-ink-300" />
      </div>
      <p v-if="series.description" class="text-sm text-ink-600 pt-1">{{ series.description }}</p>
      <p v-else class="text-sm text-ink-300 italic pt-1">Tanpa deskripsi.</p>
    </div>

    <div v-if="series.products?.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <div
        v-for="p in series.products"
        :key="p.id"
        class="panel overflow-hidden flex flex-col"
      >
        <NuxtLink :to="`/products/${p.id}`" class="aspect-[4/3] bg-ink-100 flex items-center justify-center overflow-hidden">
          <img v-if="p.imageKey" :src="`/api/products/${p.id}/image`" :alt="p.name" class="w-full h-full object-cover" />
          <PhotoIcon v-else class="w-10 h-10 text-ink-300" />
        </NuxtLink>
        <div class="p-3 flex-1 flex flex-col gap-1.5">
          <div class="flex items-start justify-between gap-2">
            <NuxtLink :to="`/products/${p.id}`" class="font-medium leading-snug break-words hover:text-accent-600">{{ p.name }}</NuxtLink>
            <span class="badge shrink-0" :class="statusBadge[p.status]">{{ statusLabel[p.status] }}</span>
          </div>
          <p v-if="p.description" class="text-xs text-ink-400 line-clamp-2">{{ p.description }}</p>
          <p class="text-xs font-mono text-ink-500">Stok {{ formatNumber(p.stockQuantity) }}</p>
          <button
            v-if="isAdmin"
            type="button"
            class="btn-danger mt-auto self-start"
            @click="removeFromSeries(p)"
          >
            <XMarkIcon class="w-4 h-4" />Lepas dari series
          </button>
        </div>
      </div>
    </div>

    <p v-else class="panel p-10 text-center text-sm text-ink-500">
      Belum ada produk dalam series ini.
      <button v-if="isAdmin" class="text-accent-600 font-medium hover:underline ml-1" @click="openAdd">Tambah produk</button>
    </p>

    <AppModal v-if="showAdd" title="Tambah Produk ke Series" @close="showAdd = false">
      <div class="space-y-3">
        <div class="relative w-full">
          <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            v-model="search"
            class="input pl-9 w-full"
            type="search"
            enterkeyhint="search"
            autocomplete="off"
            placeholder="Cari produk…"
          />
        </div>
        <ul v-if="available.length" class="max-h-72 overflow-y-auto divide-y divide-ink-100 border border-ink-200 rounded-panel">
          <li v-for="p in available" :key="p.id">
            <label class="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-ink-50">
              <input type="checkbox" class="rounded" :checked="selected.includes(p.id)" @change="toggle(p.id)" />
              <div class="w-10 h-10 rounded border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center shrink-0">
                <img v-if="p.imageKey" :src="`/api/products/${p.id}/image`" alt="" class="w-full h-full object-cover" />
                <PhotoIcon v-else class="w-4 h-4 text-ink-300" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-medium text-sm truncate">{{ p.name }}</div>
                <div class="text-xs text-ink-400">
                  {{ statusLabel[p.status] }}
                  <span v-if="p.seriesId"> · sudah di series lain</span>
                </div>
              </div>
            </label>
          </li>
        </ul>
        <p v-else class="text-sm text-ink-500 py-4 text-center">
          {{ search ? 'Tidak ada produk yang cocok.' : 'Semua produk sudah masuk series ini.' }}
        </p>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" @click="showAdd = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="button" class="btn-primary" :disabled="saving || !selected.length" @click="addSelected">
            <CheckIcon class="w-4 h-4" />{{ saving ? 'Menyimpan…' : `Tambah (${selected.length})` }}
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
