<script setup>
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  PlayIcon,
  PhotoIcon,
  ArrowPathIcon
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

const filters = ref({ status: '', productId: '', custom: '', dateFrom: '', dateTo: '' })
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

const nowMs = ref(Date.now())
let tick
onMounted(() => {
  tick = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (tick) clearInterval(tick)
})

const showForm = ref(false)
const editing = ref(null)
const form = ref({})
const errorMsg = ref('')
const saving = ref(false)

const completeTarget = ref(null)
const completeForm = ref({ good: 0, failed: 0 })
const completeError = ref('')
const completeSaving = ref(false)

function openAdd() {
  editing.value = null
  const first = products.value?.find((p) => p.status === 'active') || products.value?.[0]
  form.value = {
    date: todayStr(),
    productId: first?.id || '',
    machineId: '',
    quantityPlanned: 1,
    quantityGood: 0,
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
    productId: j.productId || '',
    customOrderId: j.customOrderId || null,
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

const formEstimateMinutes = computed(() => {
  const per = selectedProduct.value?.printMinutesPerUnit || 0
  const qty = Math.max(Math.round(Number(form.value.quantityPlanned) || 1), 1)
  return per * qty
})

function formatMinutes(total) {
  const n = Math.max(Math.round(Number(total) || 0), 0)
  if (!n) return '—'
  const h = Math.floor(n / 60)
  const m = n % 60
  if (h && m) return `${h}j ${m} mnt`
  if (h) return `${h} jam`
  return `${m} mnt`
}

function formatElapsed(ms) {
  const sec = Math.max(Math.floor(ms / 1000), 0)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h) return `${h}j ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(s).padStart(2, '0')}d`
}

function jobProgress(j) {
  nowMs.value
  if (j.status !== 'in_progress' || !j.startedAt) return null
  const elapsed = Math.max(0, nowMs.value - new Date(j.startedAt).getTime())
  const totalMs = (j.durationMinutes || 0) * 60 * 1000
  if (!totalMs) {
    return { pct: 0, label: `berjalan ${formatElapsed(elapsed)}`, over: false, unknown: true }
  }
  const over = elapsed > totalMs
  const pct = Math.min(100, Math.round((elapsed / totalMs) * 100))
  return {
    pct,
    label: over
      ? `lewat ${formatElapsed(elapsed - totalMs)} · estimasi ${formatMinutes(j.durationMinutes)}`
      : `${formatElapsed(elapsed)} / ${formatMinutes(j.durationMinutes)}`,
    over,
    unknown: false
  }
}

function jobPayload(j, extra = {}) {
  return {
    date: extra.date ?? j.date,
    productId: extra.productId ?? j.productId,
    customOrderId: extra.customOrderId ?? j.customOrderId,
    machineId: extra.machineId ?? j.machineId,
    quantityPlanned: extra.quantityPlanned ?? j.quantityPlanned,
    quantityGood: extra.quantityGood ?? j.quantityGood,
    quantityFailed: extra.quantityFailed ?? j.quantityFailed,
    status: extra.status ?? j.status,
    notes: extra.notes ?? j.notes
  }
}

function jobTitle(j) {
  return j.isCustom ? `${j.productName} · ${j.customerName}` : j.productName
}

async function save() {
  errorMsg.value = ''
  if (form.value.status === 'done') {
    const good = Math.max(Math.round(Number(form.value.quantityGood) || 0), 0)
    const failed = Math.max(Math.round(Number(form.value.quantityFailed) || 0), 0)
    if (good + failed <= 0) {
      errorMsg.value = 'Isi jumlah jadi atau gagal sebelum menandai selesai'
      return
    }
    const ok = await useConfirm().confirm(
      form.value.customOrderId
        ? good
          ? `${good} unit jadi untuk pelanggan (tidak masuk stok produk)${failed ? `, ${failed} gagal` : ''}. Lanjutkan?`
          : 'Semua unit gagal. Stok produk tidak berubah, material tetap terpotong. Lanjutkan?'
        : good
          ? `${good} unit jadi masuk stok produk${failed ? `, ${failed} unit gagal (material tetap terpotong)` : ''}. Lanjutkan?`
          : `Semua unit gagal. Stok produk tidak bertambah, material tetap terpotong. Lanjutkan?`,
      { title: 'Konfirmasi selesai', confirmText: 'Ya, selesai', danger: !good }
    )
    if (!ok) return
  }
  saving.value = true
  try {
    const body = {
      ...form.value,
      machineId: form.value.machineId || null,
      productId: form.value.customOrderId ? null : form.value.productId
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
      body: jobPayload(j, { status })
    })
    await refresh()
    await refreshProducts()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal mengubah status')
  }
}

function openComplete(j) {
  completeTarget.value = j
  completeForm.value = {
    good: Math.max(j.quantityPlanned || 1, 0),
    failed: 0
  }
  completeError.value = ''
}

const completeTotal = computed(
  () => Math.max(Math.round(Number(completeForm.value.good) || 0), 0) + Math.max(Math.round(Number(completeForm.value.failed) || 0), 0)
)

watch(
  () => completeForm.value.good,
  (n) => {
    if (!completeTarget.value) return
    const planned = completeTarget.value.quantityPlanned || 0
    const good = Math.max(Math.round(Number(n) || 0), 0)
    completeForm.value.failed = Math.max(planned - good, 0)
  }
)

async function submitComplete() {
  const j = completeTarget.value
  if (!j) return
  const good = Math.max(Math.round(Number(completeForm.value.good) || 0), 0)
  const failed = Math.max(Math.round(Number(completeForm.value.failed) || 0), 0)
  if (good + failed <= 0) {
    completeError.value = 'Isi jumlah jadi atau gagal'
    return
  }
    const ok = await useConfirm().confirm(
      j.isCustom
        ? good
          ? `Selesaikan produksi "${jobTitle(j)}"? ${good} unit jadi untuk pelanggan (tidak masuk stok)${failed ? `, ${failed} gagal` : ''}.`
          : `Selesaikan "${jobTitle(j)}" sebagai gagal semua? Stok produk tidak berubah, material tetap terpotong.`
        : good
          ? `Selesaikan produksi "${j.productName}"? ${good} unit jadi masuk stok${failed ? `, ${failed} unit gagal` : ''}.`
          : `Selesaikan "${j.productName}" sebagai gagal semua? Stok produk tidak bertambah, material tetap terpotong.`,
      { title: 'Konfirmasi hasil produksi', confirmText: 'Ya, selesaikan', danger: !good }
    )
  if (!ok) return
  completeSaving.value = true
  completeError.value = ''
  try {
    await $fetch(`/api/productions/${j.id}`, {
      method: 'PUT',
      body: jobPayload(j, { status: 'done', quantityGood: good, quantityFailed: failed })
    })
    completeTarget.value = null
    await refresh()
    await refreshProducts()
    useToast().success(
      j.isCustom
        ? good
          ? `${good} unit siap diserahkan ke pelanggan`
          : 'Produksi ditandai gagal, stok produk tidak berubah'
        : good
          ? `${good} unit masuk stok ${j.productName}`
          : 'Produksi ditandai gagal, stok produk tidak berubah'
    )
  } catch (e) {
    completeError.value = e.data?.statusMessage || 'Gagal menyelesaikan produksi'
  } finally {
    completeSaving.value = false
  }
}

async function retryFailed(j) {
  const n = j.quantityFailed || 0
  if (
    !(await useConfirm().confirm(
      `Buat antrian baru ${n} unit untuk mengulang cetak yang gagal? Job lama tetap tercatat selesai.`,
      { title: 'Ulang cetak gagal', confirmText: 'Buat antrian', danger: false }
    ))
  ) {
    return
  }
  try {
    await $fetch(`/api/productions/${j.id}/retry`, { method: 'POST' })
    await refresh()
    await refreshProducts()
    useToast().success(`Antrian ulang ${n} unit dibuat.`)
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal membuat antrian ulang')
  }
}

async function remove(j) {
  const extra = j.stockApplied ? ' Stok produk dan material akan dikembalikan.' : ''
  if (!(await useConfirm().confirm(`Hapus produksi "${jobTitle(j)}"?${extra}`))) return
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
      Progress mengikuti durasi cetak (recipe atau pesanan custom) sejak produksi dimulai. Katalog: unit jadi masuk stok.
      Custom: unit jadi untuk pelanggan, tidak masuk stok produk.
      Unit gagal: job tetap selesai (material sudah terpotong); tombol Ulang membuat antrian baru.
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

    <div class="panel p-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
      <div>
        <label class="label">Status</label>
        <select v-model="filters.status" class="input">
          <option value="">Semua</option>
          <option v-for="(label, key) in statusLabel" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
      <div>
        <label class="label">Jenis</label>
        <select v-model="filters.custom" class="input">
          <option value="">Semua</option>
          <option value="0">Katalog</option>
          <option value="1">Custom</option>
        </select>
      </div>
      <div>
        <label class="label">Produk</label>
        <select v-model="filters.productId" class="input">
          <option value="">Semua</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
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
      <div v-for="j in paged" :key="j.id" class="panel p-3 space-y-2">
        <div class="flex items-start gap-3">
          <div class="w-12 h-12 rounded border border-ink-200 bg-ink-50 overflow-hidden shrink-0 flex items-center justify-center">
            <img v-if="j.productImageKey" :src="`/api/products/${j.productId}/image`" alt="" class="w-full h-full object-cover" />
            <PhotoIcon v-else class="w-5 h-5 text-ink-300" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <NuxtLink v-if="j.customOrderId" :to="`/custom-orders/${j.customOrderId}`" class="font-medium break-words hover:underline">{{ jobTitle(j) }}</NuxtLink>
              <span v-else class="font-medium break-words">{{ jobTitle(j) }}</span>
              <span class="badge shrink-0" :class="statusBadge[j.status]">{{ statusLabel[j.status] }}</span>
            </div>
            <div class="text-xs text-ink-500 font-mono">
              {{ formatDate(j.date) }} · rencana {{ j.quantityPlanned }}
              <template v-if="j.status === 'done'"> · jadi {{ j.quantityGood }} · gagal {{ j.quantityFailed }}</template>
            </div>
            <div v-if="j.isCustom" class="text-xs text-ink-400">custom · tidak masuk stok</div>
            <div v-else-if="j.machineName" class="text-xs text-ink-400">{{ j.machineName }}</div>
            <div v-if="jobProgress(j)" class="mt-2 space-y-1">
              <div class="flex justify-between gap-2 text-[11px]" :class="jobProgress(j).over ? 'text-amber-700' : 'text-ink-500'">
                <span>{{ jobProgress(j).label }}</span>
                <span v-if="!jobProgress(j).unknown" class="font-mono">{{ jobProgress(j).pct }}%</span>
              </div>
              <div class="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div
                  class="h-full rounded-full transition-[width] duration-300"
                  :class="jobProgress(j).over ? 'bg-amber-500' : 'bg-accent-500'"
                  :style="{ width: (jobProgress(j).unknown ? 40 : Math.max(jobProgress(j).pct, 2)) + '%' }"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-1">
          <button v-if="j.status === 'queued'" class="btn-secondary" @click="setStatus(j, 'in_progress')">
            <PlayIcon class="w-3.5 h-3.5" />Mulai
          </button>
          <button v-if="j.status === 'queued' || j.status === 'in_progress'" class="btn-primary" @click="openComplete(j)">
            <CheckIcon class="w-3.5 h-3.5" />Selesai
          </button>
          <button
            v-if="j.status === 'done' && j.quantityFailed > 0 && !j.retried"
            class="btn-secondary"
            @click="retryFailed(j)"
          >
            <ArrowPathIcon class="w-4 h-4" />Ulang
          </button>
          <button class="btn-secondary" @click="openEdit(j)"><PencilSquareIcon class="w-4 h-4" />Edit</button>
          <button class="btn-danger" @click="remove(j)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
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
              <th>Progress</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in paged" :key="j.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(j.date) }}</td>
              <td>
                <div class="font-medium">
                  <NuxtLink v-if="j.customOrderId" :to="`/custom-orders/${j.customOrderId}`" class="hover:underline">{{ jobTitle(j) }}</NuxtLink>
                  <span v-else>{{ j.productName }}</span>
                </div>
                <div class="text-xs text-ink-400">{{ j.isCustom ? 'custom' : `stok ${formatNumber(j.productStock)}` }}</div>
              </td>
              <td class="text-ink-500">{{ j.machineName || '—' }}</td>
              <td class="num">{{ j.quantityPlanned }}</td>
              <td class="num">{{ j.status === 'done' ? j.quantityGood : '—' }}</td>
              <td class="num">{{ j.status === 'done' ? j.quantityFailed : '—' }}</td>
              <td class="min-w-[10rem]">
                <span class="badge" :class="statusBadge[j.status]">{{ statusLabel[j.status] }}</span>
                <div v-if="jobProgress(j)" class="mt-1.5 space-y-1">
                  <div class="flex items-center gap-2">
                    <div class="h-1.5 flex-1 rounded-full bg-ink-100 overflow-hidden">
                      <div
                        class="h-full rounded-full transition-[width] duration-300"
                        :class="jobProgress(j).over ? 'bg-amber-500' : 'bg-accent-500'"
                        :style="{ width: (jobProgress(j).unknown ? 40 : Math.max(jobProgress(j).pct, 2)) + '%' }"
                      />
                    </div>
                    <span
                      v-if="!jobProgress(j).unknown"
                      class="font-mono text-[11px] tabular-nums shrink-0 w-10 text-right"
                      :class="jobProgress(j).over ? 'text-amber-700' : 'text-ink-500'"
                    >{{ jobProgress(j).pct }}%</span>
                  </div>
                  <div class="text-[11px]" :class="jobProgress(j).over ? 'text-amber-700' : 'text-ink-400'">
                    {{ jobProgress(j).label }}
                  </div>
                </div>
              </td>
              <td class="whitespace-nowrap text-right">
                <button v-if="j.status === 'queued'" class="btn-secondary" @click="setStatus(j, 'in_progress')">
                  <PlayIcon class="w-4 h-4" />Mulai
                </button>
                <button
                  v-if="j.status === 'queued' || j.status === 'in_progress'"
                  class="btn-primary ml-1"
                  @click="openComplete(j)"
                >
                  <CheckIcon class="w-4 h-4" />Selesai
                </button>
                <button
                  v-if="j.status === 'done' && j.quantityFailed > 0 && !j.retried"
                  class="btn-secondary ml-1"
                  @click="retryFailed(j)"
                >
                  <ArrowPathIcon class="w-4 h-4" />Ulang
                </button>
                <button class="btn-secondary ml-1" @click="openEdit(j)"><PencilSquareIcon class="w-4 h-4" />Edit</button>
                <button class="btn-danger ml-1" @click="remove(j)"><TrashIcon class="w-4 h-4" />Hapus</button>
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
          <label class="label">{{ form.customOrderId ? 'Pesanan custom' : 'Produk' }}</label>
          <p v-if="form.customOrderId" class="input bg-ink-50">Custom — lihat halaman pesanan</p>
          <select v-else v-model="form.productId" class="input" required>
            <option v-for="p in products" :key="p.id" :value="p.id">
              {{ p.name }} · stok {{ formatNumber(p.stockQuantity) }}{{ p.hasRecipe ? '' : ' (belum recipe)' }}
            </option>
          </select>
          <p v-if="selectedProduct && !selectedProduct.hasRecipe" class="text-xs text-amber-600 mt-1">
            Belum ada recipe — stok produk tetap bertambah saat selesai, material tidak terpotong.
          </p>
          <p v-else-if="selectedProduct" class="text-xs text-ink-500 mt-1">
            Durasi recipe {{ formatMinutes(selectedProduct.printMinutesPerUnit) }} / unit
            · estimasi {{ formatMinutes(formEstimateMinutes) }} untuk {{ form.quantityPlanned || 1 }} unit
          </p>
        </div>
        <div>
          <label class="label">Mesin (opsional)</label>
          <select v-model="form.machineId" class="input">
            <option value="">—</option>
            <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
        <div :class="form.status === 'done' ? 'grid grid-cols-3 gap-3' : ''">
          <div>
            <label class="label">Rencana</label>
            <input v-model.number="form.quantityPlanned" type="number" min="1" class="input-num" required />
          </div>
          <template v-if="form.status === 'done'">
            <div>
              <label class="label">Jadi</label>
              <input v-model.number="form.quantityGood" type="number" min="0" class="input-num" />
            </div>
            <div>
              <label class="label">Gagal</label>
              <input v-model.number="form.quantityFailed" type="number" min="0" class="input-num" />
            </div>
          </template>
        </div>
        <p v-if="form.status === 'done'" class="text-xs text-ink-500">
          {{ form.customOrderId ? 'Unit jadi untuk pelanggan, tidak masuk stok produk.' : 'Unit jadi masuk stok. Gagal cetak tetap memotong material.' }}
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

    <AppModal v-if="completeTarget" title="Hasil produksi" @close="completeTarget = null">
      <div class="space-y-3">
        <p class="text-sm text-ink-700">
          <span class="font-medium">{{ jobTitle(completeTarget) }}</span>
          · rencana {{ completeTarget.quantityPlanned }} unit
        </p>
        <p class="text-xs text-ink-500">
          Estimasi cetak {{ formatMinutes(completeTarget.durationMinutes || completeTarget.printMinutesPerUnit * completeTarget.quantityPlanned) }}.
          {{ completeTarget.isCustom ? 'Unit jadi untuk pelanggan, tidak masuk stok produk.' : 'Dari durasi recipe.' }}
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Unit jadi</label>
            <input v-model.number="completeForm.good" type="number" min="0" class="input-num" />
            <p class="text-[11px] text-ink-400 mt-1">{{ completeTarget.isCustom ? 'Untuk pelanggan' : 'Masuk stok produk' }}</p>
          </div>
          <div>
            <label class="label">Unit gagal</label>
            <input v-model.number="completeForm.failed" type="number" min="0" class="input-num" />
            <p class="text-[11px] text-ink-400 mt-1">Material tetap terpotong</p>
          </div>
        </div>
        <p
          v-if="completeTotal !== completeTarget.quantityPlanned"
          class="text-xs text-amber-700"
        >
          Total {{ completeTotal }} berbeda dari rencana {{ completeTarget.quantityPlanned }}.
        </p>
        <p v-if="completeError" class="text-sm text-red-600">{{ completeError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" @click="completeTarget = null"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="button" class="btn-primary" :disabled="completeSaving" @click="submitComplete">
            <CheckIcon class="w-4 h-4" />{{ completeSaving ? 'Menyimpan…' : 'Konfirmasi selesai' }}
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
