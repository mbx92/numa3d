<script setup>
import { PlusIcon, PencilSquareIcon, TrashIcon, CheckIcon, XMarkIcon, ArrowUpTrayIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const filters = ref({ type: '', dateFrom: '', dateTo: '' })
const query = computed(() => {
  const q = {}
  for (const [k, v] of Object.entries(filters.value)) if (v) q[k] = v
  return q
})
const { data, refresh } = await useFetch('/api/capital', { query })

const transactions = computed(() => data.value?.transactions || [])
const summary = computed(() => data.value?.summary || {})

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  computed(() => transactions.value || []),
  10
)
watch(query, reset, { deep: true })

const typeLabel = { deposit: 'Setoran', withdrawal: 'Penarikan' }
const typeBadge = {
  deposit: 'bg-teal-500/10 text-teal-600',
  withdrawal: 'bg-amber-100 text-amber-700'
}

const showForm = ref(false)
const editing = ref(null)
const form = ref({})
const errorMsg = ref('')

function openAdd() {
  editing.value = null
  form.value = { date: todayStr(), type: 'deposit', amount: 0, notes: '' }
  errorMsg.value = ''
  showForm.value = true
}
function openEdit(t) {
  editing.value = t
  form.value = { ...t, notes: t.notes || '' }
  errorMsg.value = ''
  showForm.value = true
}
async function save() {
  errorMsg.value = ''
  try {
    if (editing.value) {
      await $fetch(`/api/capital/${editing.value.id}`, { method: 'PUT', body: form.value })
    } else {
      await $fetch('/api/capital', { method: 'POST', body: form.value })
    }
    showForm.value = false
    await refresh()
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  }
}
async function remove(t) {
  if (!(await useConfirm().confirm(`Hapus ${typeLabel[t.type].toLowerCase()} modal ini?`))) return
  try {
    await $fetch(`/api/capital/${t.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Modal</h1>
      <button v-if="isAdmin" class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Catat Mutasi</span><span class="sm:hidden">Catat</span>
      </button>
    </div>

    <p v-if="!isAdmin" class="text-xs text-ink-500">Read-only — hanya admin yang bisa mengubah modal.</p>

    <!-- Ringkasan posisi modal -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Total setoran</div>
        <div class="mt-1 font-mono text-lg sm:text-xl font-semibold text-teal-600">{{ formatIDR(summary.totalDeposit) }}</div>
      </div>
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Total penarikan</div>
        <div class="mt-1 font-mono text-lg sm:text-xl font-semibold text-red-600">{{ formatIDR(summary.totalWithdrawal) }}</div>
      </div>
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Modal bersih</div>
        <div
          class="mt-1 font-mono text-lg sm:text-xl font-semibold"
          :class="(summary.netCapital ?? 0) >= 0 ? 'text-ink-900' : 'text-red-600'"
        >
          {{ formatIDR(summary.netCapital) }}
        </div>
      </div>
      <div class="panel p-3 sm:p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-500">Estimasi kas</div>
        <div
          class="mt-1 font-mono text-lg sm:text-xl font-semibold"
          :class="(summary.estimatedCash ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'"
        >
          {{ formatIDR(summary.estimatedCash) }}
        </div>
      </div>
    </div>

    <!-- Rincian estimasi kas -->
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Rincian Estimasi Kas</span></div>
      <table class="table-std">
        <tbody>
          <tr>
            <td>Modal bersih (setoran − penarikan)</td>
            <td class="num">{{ formatIDR(summary.netCapital) }}</td>
          </tr>
          <tr>
            <td class="pl-6 text-ink-500">+ Revenue bersih kumulatif (setelah fee marketplace)</td>
            <td class="num text-teal-600">{{ formatIDR(summary.salesNetRevenue) }}</td>
          </tr>
          <tr>
            <td class="pl-6 text-ink-500">− Total pengeluaran</td>
            <td class="num text-red-600">{{ formatIDR(summary.totalExpenses) }}</td>
          </tr>
          <tr>
            <td class="pl-6 text-ink-500">− Pembelian mesin (aset)</td>
            <td class="num text-red-600">{{ formatIDR(summary.machinePurchases) }}</td>
          </tr>
          <tr class="bg-ink-50 font-semibold">
            <td>Estimasi kas</td>
            <td class="num text-base" :class="(summary.estimatedCash ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ formatIDR(summary.estimatedCash) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="p-3 text-xs text-ink-500 border-t border-ink-200">
        Perkiraan kasar posisi kas: modal bersih + uang masuk dari penjualan − uang keluar (pengeluaran + beli mesin).
        Bukan laporan akuntansi penuh.
      </div>
    </div>

    <!-- Filter -->
    <div class="panel p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div>
        <label class="label">Jenis</label>
        <select v-model="filters.type" class="input !py-1.5">
          <option value="">Semua</option>
          <option value="deposit">Setoran</option>
          <option value="withdrawal">Penarikan</option>
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

    <!-- Kartu (mobile) -->
    <div class="md:hidden space-y-2">
      <div v-for="t in paged" :key="t.id" class="panel p-3 space-y-1">
        <div class="flex items-start justify-between gap-2">
          <span class="font-medium">{{ typeLabel[t.type] }}</span>
          <span
            class="font-mono font-semibold shrink-0"
            :class="t.type === 'deposit' ? 'text-teal-600' : 'text-red-600'"
          >
            {{ t.type === 'deposit' ? '+' : '−' }}{{ formatIDR(t.amount) }}
          </span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-mono text-xs text-ink-500">{{ formatDate(t.date) }}</span>
        </div>
        <div v-if="t.notes" class="text-xs text-ink-400 break-words">{{ t.notes }}</div>
        <div v-if="isAdmin" class="flex flex-wrap gap-1 pt-1">
          <button class="btn-secondary !py-1 !px-2 text-xs" @click="openEdit(t)"><PencilSquareIcon class="w-3.5 h-3.5" />Edit</button>
          <button class="btn-danger !py-1 !px-2 text-xs" @click="remove(t)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
        </div>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada mutasi modal.</p>
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

    <!-- Tabel (desktop) -->
    <div class="panel hidden md:block">
      <div class="overflow-x-auto">
        <table class="table-std">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jenis</th>
              <th>Keterangan</th>
              <th class="!text-right">Jumlah</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in paged" :key="t.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(t.date) }}</td>
              <td>
                <span class="badge inline-flex items-center gap-1" :class="typeBadge[t.type]">
                  <ArrowUpTrayIcon v-if="t.type === 'deposit'" class="w-3.5 h-3.5" />
                  <ArrowDownTrayIcon v-else class="w-3.5 h-3.5" />
                  {{ typeLabel[t.type] }}
                </span>
              </td>
              <td class="text-ink-600">{{ t.notes || '-' }}</td>
              <td class="num" :class="t.type === 'deposit' ? 'text-teal-600' : 'text-red-600'">
                {{ t.type === 'deposit' ? '+' : '−' }}{{ formatIDR(t.amount) }}
              </td>
              <td v-if="isAdmin" class="whitespace-nowrap text-right">
                <button class="btn-secondary !py-1 !px-2 text-xs" @click="openEdit(t)"><PencilSquareIcon class="w-3.5 h-3.5" />Edit</button>
                <button class="btn-danger !py-1 !px-2 text-xs ml-1" @click="remove(t)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
              </td>
              <td v-else></td>
            </tr>
            <tr v-if="!total">
              <td colspan="5" class="text-center text-ink-500 py-6">Belum ada mutasi modal.</td>
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

    <AppModal v-if="showForm" :title="editing ? 'Edit Mutasi Modal' : 'Catat Mutasi Modal'" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Tanggal</label>
            <input v-model="form.date" type="date" class="input" required />
          </div>
          <div>
            <label class="label">Jenis</label>
            <select v-model="form.type" class="input">
              <option value="deposit">Setoran</option>
              <option value="withdrawal">Penarikan</option>
            </select>
          </div>
        </div>
        <div>
          <label class="label">Jumlah</label>
          <div class="money-input">
            <span class="money-input__prefix">Rp</span>
            <input v-model.number="form.amount" type="number" min="1" class="input-num" required placeholder="0" />
          </div>
        </div>
        <div>
          <label class="label">Keterangan (opsional)</label>
          <input v-model="form.notes" class="input" placeholder="Modal awal, setoran tambahan, prive…" />
        </div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan</button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
