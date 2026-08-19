<script setup>
import { PlusIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const statusLabel = {
  open: 'Proses',
  ready: 'Siap serah',
  delivered: 'Diserahkan',
  cancelled: 'Batal'
}
const statusBadge = {
  open: 'bg-amber-100 text-amber-800',
  ready: 'bg-teal-100 text-teal-800',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-ink-100 text-ink-400'
}
const channelLabel = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok_shop: 'TikTok Shop',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  direct: 'Langsung',
  other: 'Lainnya'
}

const filters = ref({ status: '', dateFrom: '', dateTo: '' })
const query = computed(() => {
  const q = {}
  for (const [k, v] of Object.entries(filters.value)) if (v) q[k] = v
  return q
})
const { data: orders, refresh } = await useFetch('/api/custom-orders', { query })
const { data: materials } = await useFetch('/api/materials')
const { data: machines } = await useFetch('/api/machines')
const { data: packagingItems } = await useFetch('/api/packaging')

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  computed(() => orders.value || []),
  10
)
watch(query, reset, { deep: true })

const showForm = ref(false)
const form = ref({})
const errorMsg = ref('')
const saving = ref(false)

function openAdd() {
  const mat = materials.value?.[0]
  form.value = {
    date: todayStr(),
    customerName: '',
    title: '',
    channel: 'whatsapp',
    quantity: 1,
    pricePerUnit: 0,
    materialId: mat?.id || '',
    materialQuantityUsed: 0,
    packagingId: '',
    packagingQuantityUsed: 0,
    machineId: machines.value?.[0]?.id || '',
    printTimeMinutes: 0,
    notes: ''
  }
  errorMsg.value = ''
  showForm.value = true
}

async function save() {
  errorMsg.value = ''
  saving.value = true
  try {
    const created = await $fetch('/api/custom-orders', {
      method: 'POST',
      body: {
        ...form.value,
        machineId: form.value.machineId || null,
        packagingId: form.value.packagingId || null
      }
    })
    showForm.value = false
    await navigateTo(`/custom-orders/${created.id}`)
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  if (!(await useConfirm().confirm(`Hapus pesanan custom "${row.title}" milik ${row.customerName}?`))) return
  try {
    await $fetch(`/api/custom-orders/${row.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}

const selectedMaterial = computed(() =>
  (materials.value || []).find((m) => Number(m.id) === Number(form.value.materialId))
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Custom</h1>
      <button class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Pesanan Custom</span><span class="sm:hidden">Catat</span>
      </button>
    </div>
    <p class="text-xs text-ink-500">
      Desain milik pelanggan — tidak masuk katalog atau stok produk. File disimpan, produksi tetap di menu Produksi,
      material terpotong saat cetak selesai.
    </p>

    <div class="panel p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div>
        <label class="label">Status</label>
        <select v-model="filters.status" class="input !py-1.5">
          <option value="">Semua</option>
          <option v-for="(label, key) in statusLabel" :key="key" :value="key">{{ label }}</option>
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
      <NuxtLink v-for="row in paged" :key="row.id" :to="`/custom-orders/${row.id}`" class="panel p-3 block space-y-1">
        <div class="flex items-start justify-between gap-2">
          <span class="font-medium break-words">{{ row.title }}</span>
          <span class="badge shrink-0" :class="statusBadge[row.status]">{{ statusLabel[row.status] }}</span>
        </div>
        <div class="text-xs text-ink-500">{{ row.customerName }} · {{ formatDate(row.date) }}</div>
        <div class="text-xs font-mono text-ink-400">{{ row.quantity }} unit · {{ formatIDR(row.pricePerUnit) }}</div>
      </NuxtLink>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada pesanan custom.</p>
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
              <th>Pelanggan</th>
              <th>Desain</th>
              <th>Material</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Harga</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paged" :key="row.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(row.date) }}</td>
              <td>{{ row.customerName }}</td>
              <td>
                <NuxtLink :to="`/custom-orders/${row.id}`" class="font-medium hover:underline">{{ row.title }}</NuxtLink>
              </td>
              <td class="text-ink-500">{{ row.materialName || '—' }}</td>
              <td class="num">{{ row.quantity }}</td>
              <td class="num">{{ formatIDR(row.pricePerUnit) }}</td>
              <td><span class="badge" :class="statusBadge[row.status]">{{ statusLabel[row.status] }}</span></td>
              <td class="text-right whitespace-nowrap">
                <NuxtLink :to="`/custom-orders/${row.id}`" class="btn-secondary !py-1 !px-2 text-xs">Detail</NuxtLink>
                <button
                  v-if="row.status !== 'delivered'"
                  class="btn-danger !py-1 !px-2 text-xs ml-1"
                  @click="remove(row)"
                >
                  <TrashIcon class="w-3.5 h-3.5" />Hapus
                </button>
              </td>
            </tr>
            <tr v-if="!total">
              <td colspan="8" class="text-center text-ink-500 py-6">Belum ada pesanan custom.</td>
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

    <AppModal v-if="showForm" title="Pesanan custom" size="lg" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Tanggal</label>
            <input v-model="form.date" type="date" class="input" required />
          </div>
          <div>
            <label class="label">Channel</label>
            <select v-model="form.channel" class="input">
              <option v-for="(label, key) in channelLabel" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="label">Nama pelanggan</label>
          <input v-model="form.customerName" class="input" required placeholder="nama / toko" />
        </div>
        <div>
          <label class="label">Judul desain</label>
          <input v-model="form.title" class="input" required placeholder="mis. gantungan kunci inisial R" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Jumlah</label>
            <input v-model.number="form.quantity" type="number" min="1" class="input-num" required />
          </div>
          <div>
            <label class="label">Harga / unit</label>
            <IdrInput v-model="form.pricePerUnit" required />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Material</label>
            <select v-model="form.materialId" class="input" required>
              <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Pakai / unit ({{ selectedMaterial?.unit || 'satuan' }})</label>
            <input v-model.number="form.materialQuantityUsed" type="number" min="0" step="0.1" class="input-num" required />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Packaging (opsional)</label>
            <select v-model="form.packagingId" class="input">
              <option value="">—</option>
              <option v-for="p in packagingItems" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Packaging / unit jadi</label>
            <input v-model.number="form.packagingQuantityUsed" type="number" min="0" step="0.1" class="input-num" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Mesin</label>
            <select v-model="form.machineId" class="input">
              <option value="">—</option>
              <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Durasi cetak / unit (mnt)</label>
            <input v-model.number="form.printTimeMinutes" type="number" min="0" class="input-num" required />
          </div>
        </div>
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.notes" class="input" placeholder="opsional — nozzle, infill, warna…" />
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary" :disabled="saving">
            <CheckIcon class="w-4 h-4" />{{ saving ? 'Menyimpan…' : 'Simpan & unggah file' }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
