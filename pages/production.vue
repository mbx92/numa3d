<script setup>
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  PlayIcon,
  PhotoIcon
} from '@heroicons/vue/24/outline'

const statusLabel = {
  queued: 'Antrian',
  in_progress: 'Proses',
  done: 'Selesai',
  cancelled: 'Batal'
}
const statusBadge = {
  queued: 'bg-ink-200 text-ink-600',
  in_progress: 'bg-amber-100 text-amber-800',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-ink-100 text-ink-400'
}

const filters = ref({ status: '', productId: '', dateFrom: '', dateTo: '' })
const query = computed(() => {
  const q = {}
  for (const [k, v] of Object.entries(filters.value)) if (v) q[k] = v
  return q
})
const { data: jobs, refresh } = await useFetch('/api/productions', { query })
const { data: products, refresh: refreshProducts } = await useFetch('/api/products')
const { data: machines } = await useFetch('/api/machines')

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  computed(() => jobs.value || []),
  10
)
watch(query, reset, { deep: true })

const inProcess = computed(() =>
  (jobs.value || []).filter((j) => j.status === 'queued' || j.status === 'in_progress')
)
const doneRows = computed(() => (jobs.value || []).filter((j) => j.status === 'done'))
const stockTotal = computed(() => (products.value || []).reduce((a, p) => a + (p.stockQuantity || 0), 0))

const showForm = ref(false)
const editing = ref(null)
const form = ref({})
const errorMsg = ref('')
const saving = ref(false)

function openAdd() {
  editing.value = null
  const first = products.value?.find((p) => p.status === 'active') || products.value?.[0]
  form.value = {
    date: todayStr(),
    productId: first?.id || '',
    machineId: '',
    quantityPlanned: 1,
    quantityGood: 1,
    quantityFailed: 0,
    status: 'in_progress',
    notes: ''
  }
  errorMsg.value = ''
  showForm.value = true
}
function openEdit(j) {
  editing.value = j
  form.value = {
    date: j.date,
    productId: j.productId,
    machineId: j.machineId || '',
    quantityPlanned: j.quantityPlanned,
    quantityGood: j.quantityGood,
    quantityFailed: j.quantityFailed,
    status: j.status,
    notes: j.notes || ''
  }
  errorMsg.value = ''
  showForm.value = true
}

const selectedProduct = computed(() =>
  (products.value || []).find((p) => Number(p.id) === Number(form.value.productId))
)

watch(
  () => form.value.quantityPlanned,
  (n) => {
    if (form.value.status !== 'done') form.value.quantityGood = Math.max(Math.round(Number(n) || 1), 1)
  }
}

async function save() {
  errorMsg.value = ''
  saving.value = true
  try {
    const body = {
      ...form.value,
      machineId: form.value.machineId || null
    }
    if (editing.value) {
      await $fetch(`/api/productions/${editing.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/productions', { method: 'POST', body })
    }
    showForm.value = false
    await refresh()
    await refreshProducts()
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  } finally {
    saving.value = false
  }
}

async function setStatus(j, status) {
  try {
    await $fetch(`/api/productions/${j.id}`, {
      method: 'PUT',
      body: {
        date: j.date,
        productId: j.productId,
        machineId: j.machineId,
        quantityPlanned: j.quantityPlanned,
        quantityGood: status === 'done' && !j.quantityGood ? j.quantityPlanned : j.quantityGood,
        quantityFailed: j.quantityFailed,
        status,
        notes: j.notes
      }
    })
    await refresh()
    await refreshProducts()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal mengubah status')
  }
}

async function remove(j) {
  const extra = j.stockApplied ? ' Stok produk dan material akan dikembalikan.' : ''
  if (!(await useConfirm().confirm(`Hapus produksi "${j.productName}"?${extra}`))) return
  try {
    await $fetch(`/api/productions/${j.id}`, { method: 'DELETE' })
    await refresh()
    await refreshProducts()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Produksi</h1>
      <button class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Catat Produksi</span><span class="sm:hidden">Catat</span>
      </button>
    </div>
    <p class="text-xs text-ink-500">
      Pantau proses cetak. Saat status <span class="font-semibold">Selesai</span>, unit jadi masuk stok produk
      dan material/packaging terpotong dari recipe.
    </p>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Sedang proses</div>
        <div class="mt-1 font-mono text-lg sm:text-xl font-semibold">{{ inProcess.length }}</div>
        <div class="text-xs text-ink-400">{{ inProcess.reduce((a, j) => a + j.quantityPlanned, 0) }} unit rencana</div>
      </div>
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Selesai (filter)</div>
        <div class="mt-1 font-mono text-lg sm:text-xl font-semibold text-green-700">
          {{ doneRows.reduce((a, j) => a + j.quantityGood, 0) }}
        </div>
        <div class="text-xs text-ink-400">unit jadi</div>
      </div>
      <div class="panel p-3 sm:p-4 col-span-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Stok produk tersedia</div>
        <div class="mt-1 font-mono text-lg sm:text-xl font-semibold">{{ formatNumber(stockTotal) }} unit</div>
        <div class="text-xs text-ink-400">semua produk · berkurang saat penjualan</div>
      </div>
    </div>

    <div class="panel p-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
      <div>
        <label class="label">Status</label>
        <select v-model="filters.status" class="input !py-1.5">
          <option value="">Semua</option>
          <option v-for="(label, key) in statusLabel" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
      <div>
        <label class="label">Produk</label>
        <select v-model="filters.productId" class="input !py-1.5">
          <option value="">Semua</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div>
        <label class="label">Dari</label>
        <input v-model="filters.dateFrom" type="date" class="input !py-1.5" />
      </div>
      <div>
        <label class="label">Sampai</label>
        <input v-model="filters.dateTo" type="date" class="input !py-1.5" />
      </div>
    </div>

    <div class="md:hidden space-y-2">
      <div v-for="j in paged" :key="j.id" class="panel p-3 space-y-2">
        <div class="flex items-start gap-3">
          <div class="w-12 h-12 rounded border border-ink-200 bg-ink-50 overflow-hidden shrink-0 flex items-center justify-center">
            <img v-if="j.productImageKey" :src="`/api/products/${j.productId}/image`" alt="" class="w-full h-full object-cover" />
            <PhotoIcon v-else class="w-5 h-5 text-ink-300" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <span class="font-medium break-words">{{ j.productName }}</span>
              <span class="badge shrink-0" :class="statusBadge[j.status]">{{ statusLabel[j.status] }}</span>
            </div>
            <div class="text-xs text-ink-500 font-mono">{{ formatDate(j.date) }} · rencana {{ j.quantityPlanned }} · jadi {{ j.quantityGood }}</div>
            <div v-if="j.machineName" class="text-xs text-ink-400">{{ j.machineName }}</div>
          </div>
        </div>
        <div class="flex flex-wrap gap-1">
          <button v-if="j.status === 'queued'" class="btn-secondary !py-1 !px-2 text-xs" @click="setStatus(j, 'in_progress')">
            <PlayIcon class="w-3.5 h-3.5" />Mulai
          </button>
          <button v-if="j.status === 'queued' || j.status === 'in_progress'" class="btn-primary !py-1 !px-2 text-xs" @click="setStatus(j, 'done')">
            <CheckIcon class="w-3.5 h-3.5" />Selesai
          </button>
          <button class="btn-secondary !py-1 !px-2 text-xs" @click="openEdit(j)"><PencilSquareIcon class="w-3.5 h-3.5" />Edit</button>
          <button class="btn-danger !py-1 !px-2 text-xs" @click="remove(j)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
        </div>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada produksi.</p>
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

    <div class="panel hidden md:block">
      <div class="overflow-x-auto">
        <table class="table-std">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Produk</th>
              <th>Mesin</th>
              <th class="text-right">Rencana</th>
              <th class="text-right">Jadi</th>
              <th class="text-right">Gagal</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in paged" :key="j.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(j.date) }}</td>
              <td>
                <div class="font-medium">{{ j.productName }}</div>
                <div class="text-xs text-ink-400">stok {{ formatNumber(j.productStock) }}</div>
              </td>
              <td class="text-ink-500">{{ j.machineName || '—' }}</td>
              <td class="num">{{ j.quantityPlanned }}</td>
              <td class="num">{{ j.quantityGood }}</td>
              <td class="num">{{ j.quantityFailed }}</td>
              <td><span class="badge" :class="statusBadge[j.status]">{{ statusLabel[j.status] }}</span></td>
              <td class="whitespace-nowrap text-right">
                <button v-if="j.status === 'queued'" class="btn-secondary !py-1 !px-2 text-xs" @click="setStatus(j, 'in_progress')">Mulai</button>
                <button
                  v-if="j.status === 'queued' || j.status === 'in_progress'"
                  class="btn-primary !py-1 !px-2 text-xs ml-1"
                  @click="setStatus(j, 'done')"
                >
                  Selesai
                </button>
                <button class="btn-secondary !py-1 !px-2 text-xs ml-1" @click="openEdit(j)">Edit</button>
                <button class="btn-danger !py-1 !px-2 text-xs ml-1" @click="remove(j)">Hapus</button>
              </td>
            </tr>
            <tr v-if="!total">
              <td colspan="8" class="text-center text-ink-500 py-6">Belum ada produksi.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination
        v-if="total"
        v-model:page="page"
        v-model:pageSize="pageSize"
        :total-pages="totalPages"
        :total="total"
        :range-start="rangeStart"
        :range-end="rangeEnd"
      />
    </div>

    <AppModal v-if="showForm" :title="editing ? 'Edit Produksi' : 'Catat Produksi'" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Tanggal</label>
            <input v-model="form.date" type="date" class="input" required />
          </div>
          <div>
            <label class="label">Status</label>
            <select v-model="form.status" class="input">
              <option v-for="(label, key) in statusLabel" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="label">Produk</label>
          <select v-model="form.productId" class="input" required>
            <option v-for="p in products" :key="p.id" :value="p.id">
              {{ p.name }} · stok {{ formatNumber(p.stockQuantity) }}{{ p.hasRecipe ? '' : ' (belum recipe)' }}
            </option>
          </select>
          <p v-if="selectedProduct && !selectedProduct.hasRecipe" class="text-xs text-amber-600 mt-1">
            Belum ada recipe — stok produk tetap bertambah saat selesai, material tidak terpotong.
          </p>
        </div>
        <div>
          <label class="label">Mesin (opsional)</label>
          <select v-model="form.machineId" class="input">
            <option value="">—</option>
            <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="label">Rencana</label>
            <input v-model.number="form.quantityPlanned" type="number" min="1" class="input-num" required />
          </div>
          <div>
            <label class="label">Jadi</label>
            <input v-model.number="form.quantityGood" type="number" min="0" class="input-num" />
          </div>
          <div>
            <label class="label">Gagal</label>
            <input v-model.number="form.quantityFailed" type="number" min="0" class="input-num" />
          </div>
        </div>
        <p class="text-xs text-ink-500">
          Unit jadi masuk stok saat status Selesai. Gagal cetak tetap memotong material, tidak menambah stok produk.
        </p>
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.notes" class="input" placeholder="opsional — mis. nozzle 0.4 / warna PLA" />
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary" :disabled="saving">
            <CheckIcon class="w-4 h-4" />{{ saving ? 'Menyimpan…' : 'Simpan' }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
