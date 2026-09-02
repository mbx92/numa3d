<script setup>
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowsUpDownIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon
} from '@heroicons/vue/24/outline'

import { MATERIAL_TYPES, materialTypeLabel, materialTypeBadge, materialLowStock } from '~/utils/materialType.js'
import { DEFAULT_MATERIAL_COLOR, materialSwatchColor } from '~/utils/materialColor.js'

const { data: materials, refresh } = await useFetch('/api/materials')
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const search = ref('')
const filteredMaterials = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return materials.value || []
  return (materials.value || []).filter(
    (m) => m.name.toLowerCase().includes(q) || (m.supplier || '').toLowerCase().includes(q)
  )
})
const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  filteredMaterials,
  10
)
watch(search, reset)

const showForm = ref(false)
const editing = ref(null)
const form = ref({})
const errorMsg = ref('')

watch(
  () => form.value.type,
  (type) => {
    if (!showForm.value || editing.value) return
    const preset = MATERIAL_TYPES.find((t) => t.id === type)
    if (preset) form.value.unit = preset.unit
  }
)

function openAdd() {
  editing.value = null
  form.value = {
    name: '',
    type: 'filament',
    unit: 'gram',
    pricePerUnit: 0,
    stockQuantity: 0,
    supplier: '',
    color: DEFAULT_MATERIAL_COLOR
  }
  errorMsg.value = ''
  showForm.value = true
}
function openEdit(m) {
  editing.value = m
  form.value = { ...m, color: m.color || DEFAULT_MATERIAL_COLOR }
  errorMsg.value = ''
  showForm.value = true
}
async function save() {
  errorMsg.value = ''
  try {
    if (editing.value) {
      await $fetch(`/api/materials/${editing.value.id}`, { method: 'PUT', body: form.value })
      useToast().success('Material diperbarui.')
    } else {
      await $fetch('/api/materials', { method: 'POST', body: form.value })
      useToast().success('Material tersimpan.')
    }
    showForm.value = false
    editing.value = null
    await refresh()
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  }
}
async function remove(m) {
  if (!(await useConfirm().confirm(`Hapus material "${m.name}"?`))) return
  try {
    await $fetch(`/api/materials/${m.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}

const adjustTarget = ref(null)
const adjustDelta = ref(0)
function openAdjust(m) {
  adjustTarget.value = m
  adjustDelta.value = 0
}
async function saveAdjust() {
  await $fetch(`/api/materials/${adjustTarget.value.id}/adjust-stock`, {
    method: 'POST',
    body: { delta: adjustDelta.value }
  })
  adjustTarget.value = null
  await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h1 class="text-xl font-bold">Material</h1>
        <p class="text-sm text-ink-500">Filament, resin, dan komponen rakit (switch, magnet). Bukan box/stiker.</p>
      </div>
      <button v-if="isAdmin" class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Tambah Material</span><span class="sm:hidden">Tambah</span>
      </button>
    </div>

    <div class="relative w-full md:max-w-xs">
      <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
      <input
        v-model="search"
        class="input pl-9 w-full"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder="Cari nama atau supplier…"
      />
    </div>

    <!-- Tabel (desktop) -->
    <div class="panel hidden md:block">
      <div class="overflow-x-auto">
        <table class="table-std">
          <thead>
            <tr>
              <th class="w-14"></th>
              <th>Nama</th>
              <th>Tipe</th>
              <th class="text-right">Harga / unit</th>
              <th class="text-right">Stok</th>
              <th>Supplier</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in paged" :key="m.id">
              <td>
                <div
                  class="w-10 h-10 rounded border border-ink-200 shrink-0"
                  :style="{ backgroundColor: materialSwatchColor(m) || '#e5e7eb' }"
                  :title="m.color || 'Tanpa warna'"
                />
              </td>
              <td class="font-medium">{{ m.name }}</td>
              <td>
                <span class="badge" :class="materialTypeBadge(m.type)">
                  {{ materialTypeLabel(m.type) }}
                </span>
              </td>
              <td class="num">{{ formatIDR(m.pricePerUnit) }}/{{ m.unit }}</td>
              <td class="num" :class="materialLowStock(m) ? 'text-amber-600 font-semibold' : ''">
                {{ formatNumber(m.stockQuantity, 1) }} {{ m.unit }}
              </td>
              <td class="text-ink-500">{{ m.supplier || '-' }}</td>
              <td class="whitespace-nowrap text-right">
                <template v-if="isAdmin">
                  <button class="btn-secondary" @click="openAdjust(m)"><ArrowsUpDownIcon class="w-3.5 h-3.5" />Stok ±</button>
                  <button class="btn-secondary ml-1" @click="openEdit(m)"><PencilSquareIcon class="w-3.5 h-3.5" />Edit</button>
                  <button class="btn-danger ml-1" @click="remove(m)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
                </template>
                <span v-else class="text-ink-300 text-xs">—</span>
              </td>
            </tr>
            <tr v-if="!total">
              <td colspan="7" class="text-center text-ink-500 py-6">
                {{ search ? 'Tidak ada material yang cocok.' : 'Belum ada material.' }}
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
      <div v-for="m in paged" :key="m.id" class="panel p-3 flex gap-3">
        <div
          class="w-14 h-14 rounded border border-ink-200 shrink-0"
          :style="{ backgroundColor: materialSwatchColor(m) || '#e5e7eb' }"
          :title="m.color || 'Tanpa warna'"
        />
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium break-words">{{ m.name }}</span>
            <span class="badge shrink-0" :class="materialTypeBadge(m.type)">
              {{ materialTypeLabel(m.type) }}
            </span>
          </div>
          <div class="text-sm font-mono">{{ formatIDR(m.pricePerUnit) }}/{{ m.unit }}</div>
          <div class="text-sm font-mono" :class="materialLowStock(m) ? 'text-amber-600 font-semibold' : 'text-ink-500'">
            Stok {{ formatNumber(m.stockQuantity, 1) }} {{ m.unit }}
          </div>
          <div class="text-xs text-ink-400">{{ m.supplier || 'tanpa supplier' }}</div>
          <div v-if="isAdmin" class="flex flex-wrap gap-1 pt-1">
            <button class="btn-secondary" @click="openAdjust(m)"><ArrowsUpDownIcon class="w-3.5 h-3.5" />Stok ±</button>
            <button class="btn-secondary" @click="openEdit(m)"><PencilSquareIcon class="w-3.5 h-3.5" />Edit</button>
            <button class="btn-danger" @click="remove(m)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
          </div>
        </div>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">
        {{ search ? 'Tidak ada material yang cocok.' : 'Belum ada material.' }}
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

    <AppModal v-if="showForm" :title="editing ? 'Edit Material' : 'Tambah Material'" @close="((showForm = false), refresh())">
      <form class="space-y-3" @submit.prevent="save">
        <div>
          <label class="label">Warna</label>
          <HexColorPicker v-model="form.color" />
          <p class="text-xs text-ink-500 mt-1">Swatch warna untuk membedakan filament, resin, atau komponen di recipe.</p>
        </div>
        <div>
          <label class="label">Nama</label>
          <input v-model="form.name" class="input" required placeholder="PLA Hitam 1kg" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Tipe</label>
            <select v-model="form.type" class="input">
              <option v-for="t in MATERIAL_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
          </div>
          <div>
            <label class="label">Unit</label>
            <select v-model="form.unit" class="input">
              <option value="gram">gram</option>
              <option value="ml">ml</option>
              <option value="pcs">pcs</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Harga per unit</label>
            <IdrInput v-model="form.pricePerUnit" required />
          </div>
          <div>
            <label class="label">Stok ({{ form.unit }})</label>
            <input v-model.number="form.stockQuantity" type="number" min="0" step="0.1" class="input-num" />
          </div>
        </div>
        <div>
          <label class="label">Supplier</label>
          <input v-model="form.supplier" class="input" placeholder="opsional" />
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

    <AppModal v-if="adjustTarget" :title="`Penyesuaian Stok — ${adjustTarget.name}`" @close="adjustTarget = null">
      <form class="space-y-3" @submit.prevent="saveAdjust">
        <p class="text-sm text-ink-600">
          Stok saat ini:
          <span class="font-mono font-semibold">{{ formatNumber(adjustTarget.stockQuantity, 1) }} {{ adjustTarget.unit }}</span>
        </p>
        <div>
          <label class="label">Perubahan (+ masuk / − keluar)</label>
          <input v-model.number="adjustDelta" type="number" step="0.1" class="input-num" required />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="adjustTarget = null"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Terapkan</button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
