<script setup>
import { PlusIcon, TrashIcon, CheckIcon, XMarkIcon, EyeIcon } from '@heroicons/vue/24/outline'
import { customOrderHppFromForm, suggestedPrettyPrice } from '~/utils/hpp.js'

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
const { data: settings } = await useFetch('/api/settings')

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  computed(() => orders.value || []),
  10
)
watch(query, reset, { deep: true })

const showForm = ref(false)
const form = ref({})
const errorMsg = ref('')
const saving = ref(false)
const sliceReady = ref(false)
const slicing = ref(false)
const filamentMaterials = computed(() => (materials.value || []).filter((m) =>
  m.type === 'filament' && m.unit === 'gram' && (!m.filamentTypeName || /^PLA/i.test(m.filamentTypeName))
))

function onSliced(job) {
  form.value.slicerJobId = job?.id || null
  if (job) form.value.materialId = job.result.materialIds[0]
  form.value.materialUsage = job ? job.result.filamentGrams.map((grams, i) => ({ materialId: job.result.materialIds[i], quantityUsed: grams / job.result.filamentGrams.reduce((a, b) => a + b, 0) * job.result.totalGrams })) : []
  form.value.materialQuantityUsed = job?.result.totalGrams || 0
  form.value.printTimeMinutes = job ? Math.ceil(job.result.printTimeSeconds / 60) : 0
}

function openAdd() {
  const mat = filamentMaterials.value[0]
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
    failureRatePercent: 5,
    laborMinutes: 0,
    laborRatePerHour: 0,
    notes: ''
  }
  sliceReady.value = false
  slicing.value = false
  errorMsg.value = ''
  showForm.value = true
}

async function save() {
  if (saving.value || slicing.value || !sliceReady.value) return
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

const hppPreview = computed(() =>
  customOrderHppFromForm(
    form.value,
    { materials: materials.value, machines: machines.value, packagingItems: packagingItems.value },
    settings.value
  )
)
const suggestedPreview = computed(() =>
  sliceReady.value ? suggestedPrettyPrice(hppPreview.value.total, settings.value?.defaultMarginPercent, settings.value?.priceRoundStep) : 0
)
function applySuggestedCustomPrice() {
  if (suggestedPreview.value) form.value.pricePerUnit = suggestedPreview.value
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <h1 class="text-xl font-bold">Custom</h1>
        <InfoTooltip label="Informasi Custom">
          Unggah STL atau 3MF pelanggan, slice dengan Orca, lalu hitung HPP sesuai material inventori. Produksi tetap di menu Produksi;
          material terpotong saat cetak selesai.
        </InfoTooltip>
      </div>
      <button class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Pesanan Custom</span><span class="sm:hidden">Catat</span>
      </button>
    </div>

    <div class="panel p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div>
        <label class="label">Status</label>
        <select v-model="filters.status" class="input">
          <option value="">Semua</option>
          <option v-for="(label, key) in statusLabel" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
      <div>
        <label class="label">Dari</label>
        <input v-model="filters.dateFrom" type="date" class="input" />
      </div>
      <div>
        <label class="label">Sampai</label>
        <input v-model="filters.dateTo" type="date" class="input" />
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
                <NuxtLink :to="`/custom-orders/${row.id}`" class="btn-secondary"><EyeIcon class="w-4 h-4" />Detail</NuxtLink>
                <button
                  v-if="row.status !== 'delivered'"
                  class="btn-danger ml-1"
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
        <CustomOrderSlice :materials="materials || []" :quantity="Number(form.quantity) || 1" :disabled="saving" @sliced="onSliced" @ready="sliceReady = $event" @busy="slicing = $event" />
        <p class="text-sm font-medium">2. Biaya dan jumlah pesanan</p>
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
            <div class="flex items-end justify-between gap-2 mb-1">
              <label class="label !mb-0">Harga / unit</label>
              <button
                v-if="suggestedPreview"
                type="button"
                class="text-xs font-medium text-accent-600 hover:text-accent-700"
                @click="applySuggestedCustomPrice"
              >
                Pakai saran {{ formatIDR(suggestedPreview) }}
              </button>
            </div>
            <IdrInput v-model="form.pricePerUnit" required />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Material dari hasil slicing</label>
            <p class="text-sm">{{ form.materialUsage?.length ? form.materialUsage.map(line => materials.find(m => m.id === line.materialId)?.name).join(', ') : 'Pilih material pada langkah slicing' }}</p>
          </div>
          <div>
            <label class="label">Gram / unit dari Orca</label>
            <input :value="form.materialQuantityUsed" class="input-num bg-ink-50" readonly />
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
            <input :value="form.printTimeMinutes" class="input-num bg-ink-50" readonly />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Gagal cetak (%)</label>
            <input v-model.number="form.failureRatePercent" type="number" min="0" max="100" step="0.5" class="input-num" />
          </div>
          <div>
            <label class="label">Kerja (menit / unit)</label>
            <input v-model.number="form.laborMinutes" type="number" min="0" class="input-num" />
          </div>
        </div>
        <div>
          <label class="label">Upah / jam</label>
          <IdrInput v-model="form.laborRatePerHour" />
        </div>
        <p v-if="sliceReady" class="text-xs text-ink-500">
          HPP estimasi {{ formatIDR(hppPreview.total) }} / unit · total {{ formatIDR(hppPreview.total * form.quantity) }}
          <span v-if="suggestedPreview"> · saran {{ formatIDR(suggestedPreview) }}</span>
        </p>
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.notes" class="input" placeholder="opsional — nozzle, infill, warna…" />
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary" :disabled="saving || slicing || !sliceReady">
            <CheckIcon class="w-4 h-4" />{{ saving ? 'Menyimpan…' : 'Simpan pesanan & file' }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
