<script setup>
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PhotoIcon
} from '@heroicons/vue/24/outline'

const channelLabel = {
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok_shop: 'TikTok Shop',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  direct: 'Langsung',
  other: 'Lainnya'
}
// Fee default per channel sebagai prefill (bisa diubah saat input)
const defaultFee = { tokopedia: 6.5, shopee: 8, tiktok_shop: 8, instagram: 0, whatsapp: 0, direct: 0, other: 0 }

const filters = ref({ productId: '', channel: '', dateFrom: '', dateTo: '' })
function setThisMonth() {
  filters.value.dateFrom = monthStartStr()
  filters.value.dateTo = todayStr()
}
function clearFilters() {
  filters.value = { productId: '', channel: '', dateFrom: '', dateTo: '' }
}

const query = computed(() => {
  const q = {}
  for (const [k, v] of Object.entries(filters.value)) if (v) q[k] = v
  return q
})
const { data: sales, refresh } = await useFetch('/api/sales', { query })
const { data: products } = await useFetch('/api/products')

const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  computed(() => sales.value || []),
  10
)
watch(query, reset, { deep: true })

const totals = computed(() => {
  const rows = sales.value || []
  return {
    units: rows.reduce((a, r) => a + r.quantity, 0),
    gross: rows.reduce((a, r) => a + r.grossRevenue, 0),
    net: rows.reduce((a, r) => a + r.netRevenue, 0),
    margin: rows.reduce((a, r) => a + r.netMargin, 0)
  }
})

// ——— Form catat penjualan ———
const showForm = ref(false)
const form = ref({})
const errorMsg = ref('')
const saving = ref(false)

function openAdd() {
  form.value = {
    date: todayStr(),
    productId: products.value?.find((p) => p.status === 'active')?.id || products.value?.[0]?.id || '',
    quantity: 1,
    salePricePerUnit: 0,
    channel: 'direct',
    marketplaceFeePercent: 0,
    notes: ''
  }
  errorMsg.value = ''
  showForm.value = true
}

const selectedProduct = computed(() => (products.value || []).find((p) => p.id === form.value.productId))

// Ringkasan hidup: apa yang benar-benar masuk kantong setelah fee & HPP.
const preview = computed(() => {
  const qty = Math.max(Number(form.value.quantity) || 0, 0)
  const price = Math.max(Number(form.value.salePricePerUnit) || 0, 0)
  const feePct = Math.min(Math.max(Number(form.value.marketplaceFeePercent) || 0, 0), 100)
  const hppPerUnit = selectedProduct.value?.hasRecipe ? selectedProduct.value.hpp : 0
  const gross = price * qty
  const fee = Math.round(gross * (feePct / 100))
  const net = gross - fee
  const cogs = hppPerUnit * qty
  const margin = net - cogs
  return {
    qty,
    hppPerUnit,
    hasHpp: !!selectedProduct.value?.hasRecipe,
    gross,
    fee,
    net,
    cogs,
    margin,
    marginPercent: net ? Math.round((margin / net) * 100) : 0,
    netPerUnit: qty ? Math.round(net / qty) : 0
  }
})
const belowCost = computed(() => preview.value.hasHpp && preview.value.qty > 0 && preview.value.margin < 0)

// Isi harga jual dari harga saran (HPP + margin default) untuk mempercepat input.
const { data: settings } = await useFetch('/api/settings')
function applySuggestedPrice() {
  const hpp = selectedProduct.value?.hpp || 0
  const m = Math.min(Math.max(settings.value?.defaultMarginPercent ?? 40, 0), 95) / 100
  form.value.salePricePerUnit = Math.ceil(hpp / (1 - m) / 500) * 500
}

watch(
  () => form.value.channel,
  (ch) => {
    if (showForm.value && ch) form.value.marketplaceFeePercent = defaultFee[ch] ?? 0
  }
)

async function save() {
  errorMsg.value = ''
  saving.value = true
  try {
    await $fetch('/api/sales', { method: 'POST', body: form.value })
    showForm.value = false
    await refresh()
    useToast().success('Penjualan tercatat.')
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  } finally {
    saving.value = false
  }
}
async function remove(s) {
  if (!(await useConfirm().confirm('Hapus catatan penjualan ini?'))) return
  await $fetch(`/api/sales/${s.id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Penjualan</h1>
      <button class="btn-primary" @click="openAdd">
        <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Catat Penjualan</span><span class="sm:hidden">Catat</span>
      </button>
    </div>

    <!-- Filter -->
    <div class="panel p-3 space-y-2 overflow-hidden">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-2 min-w-0">
        <div class="min-w-0 lg:w-44">
          <label class="label">Produk</label>
          <select v-model="filters.productId" class="input">
            <option value="">Semua</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="min-w-0 lg:w-36">
          <label class="label">Channel</label>
          <select v-model="filters.channel" class="input">
            <option value="">Semua</option>
            <option v-for="(label, key) in channelLabel" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div class="date-range col-span-full lg:contents">
          <div class="date-field lg:w-40">
            <label class="label">Dari</label>
            <input v-model="filters.dateFrom" type="date" class="input" />
          </div>
          <div class="date-field lg:w-40">
            <label class="label">Sampai</label>
            <input v-model="filters.dateTo" type="date" class="input" />
          </div>
        </div>
        <div class="flex gap-2 col-span-full lg:col-auto">
          <button type="button" class="btn-secondary !py-1.5 text-xs flex-1 lg:flex-none" @click="setThisMonth">
            <CalendarDaysIcon class="w-3.5 h-3.5" />Bulan ini
          </button>
          <button type="button" class="btn-secondary !py-1.5 text-xs flex-1 lg:flex-none" @click="clearFilters">
            <ArrowPathIcon class="w-3.5 h-3.5" />Reset
          </button>
        </div>
      </div>
    </div>

    <!-- Running totals -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Unit terjual</div>
        <div class="font-mono text-lg sm:text-xl font-semibold">{{ formatNumber(totals.units) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Revenue kotor</div>
        <div class="font-mono text-lg sm:text-xl font-semibold">{{ formatIDR(totals.gross) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Revenue bersih</div>
        <div class="font-mono text-lg sm:text-xl font-semibold text-teal-600">{{ formatIDR(totals.net) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Margin bersih</div>
        <div class="font-mono text-lg sm:text-xl font-semibold" :class="totals.margin >= 0 ? 'text-green-600' : 'text-red-600'">
          {{ formatIDR(totals.margin) }}
        </div>
      </div>
    </div>

    <!-- Kartu (mobile) -->
    <div class="md:hidden space-y-2">
      <div v-for="s in paged" :key="s.id" class="panel p-3 space-y-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-medium break-words">{{ s.productName }}</div>
            <div class="text-xs font-mono text-ink-500">{{ formatDate(s.date) }}</div>
          </div>
          <span class="badge bg-ink-100 text-ink-600 shrink-0">{{ channelLabel[s.channel] }}</span>
        </div>
        <div v-if="s.notes" class="text-xs text-ink-400">{{ s.notes }}</div>
        <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm pt-1">
          <div class="flex justify-between"><dt class="text-ink-500">Qty</dt><dd class="font-mono">{{ s.quantity }}</dd></div>
          <div class="flex justify-between"><dt class="text-ink-500">Harga</dt><dd class="font-mono">{{ formatIDR(s.salePricePerUnit) }}</dd></div>
          <div class="flex justify-between"><dt class="text-ink-500">Fee</dt><dd class="font-mono">{{ s.marketplaceFeePercent ? s.marketplaceFeePercent + '%' : '–' }}</dd></div>
          <div class="flex justify-between">
            <dt class="text-ink-500">Margin</dt>
            <dd class="font-mono" :class="s.netMargin >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatIDR(s.netMargin) }}</dd>
          </div>
        </dl>
        <div class="pt-1">
          <button class="btn-danger !py-1 !px-2 text-xs" @click="remove(s)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
        </div>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada penjualan pada filter ini.</p>
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
              <th>Channel</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Harga/unit</th>
              <th class="text-right">Fee</th>
              <th class="text-right">Bersih/unit</th>
              <th class="text-right">Margin bersih</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in paged" :key="s.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(s.date) }}</td>
              <td class="font-medium">
                {{ s.productName }}
                <div v-if="s.notes" class="text-xs text-ink-400">{{ s.notes }}</div>
              </td>
              <td><span class="badge bg-ink-100 text-ink-600">{{ channelLabel[s.channel] }}</span></td>
              <td class="num">{{ s.quantity }}</td>
              <td class="num">{{ formatIDR(s.salePricePerUnit) }}</td>
              <td class="num text-ink-500">{{ s.marketplaceFeePercent ? s.marketplaceFeePercent + '%' : '-' }}</td>
              <td class="num">{{ formatIDR(s.netPricePerUnit) }}</td>
              <td class="num" :class="s.netMargin >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatIDR(s.netMargin) }}</td>
              <td class="text-right">
                <button class="btn-danger !py-1 !px-2 text-xs" @click="remove(s)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
              </td>
            </tr>
            <tr v-if="!total">
              <td colspan="9" class="text-center text-ink-500 py-6">Belum ada penjualan pada filter ini.</td>
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

    <!-- Form catat penjualan: input di kiri, ringkasan margin hidup di kanan -->
    <AppModal v-if="showForm" title="Catat Penjualan" size="lg" @close="showForm = false">
      <form class="grid grid-cols-1 lg:grid-cols-5 gap-4" @submit.prevent="save">
        <div class="lg:col-span-3 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="date-field">
              <label class="label">Tanggal</label>
              <input v-model="form.date" type="date" class="input" required />
            </div>
            <div class="min-w-0">
              <label class="label">Channel</label>
              <select v-model="form.channel" class="input">
                <option v-for="(label, key) in channelLabel" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="label">Produk</label>
            <select v-model="form.productId" class="input" required>
              <option v-for="p in products" :key="p.id" :value="p.id">
                {{ p.name }}{{ p.hasRecipe ? ` — HPP ${formatIDR(p.hpp)}` : ' — belum ada recipe' }} · stok {{ formatNumber(p.stockQuantity) }}
              </option>
            </select>
            <div v-if="selectedProduct" class="flex items-center gap-2 mt-2">
              <div class="w-10 h-10 rounded border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center shrink-0">
                <img
                  v-if="selectedProduct.imageKey"
                  :src="`/api/products/${selectedProduct.id}/image`"
                  alt=""
                  class="w-full h-full object-cover"
                />
                <PhotoIcon v-else class="w-4 h-4 text-ink-300" />
              </div>
              <p v-if="!selectedProduct.hasRecipe" class="text-xs text-amber-600">
                Produk ini belum punya recipe — margin tidak bisa dihitung.
              </p>
              <p v-else class="text-xs text-ink-500">
                HPP {{ formatIDR(selectedProduct.hpp) }} / unit · stok {{ formatNumber(selectedProduct.stockQuantity) }}
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Qty</label>
              <input v-model.number="form.quantity" type="number" min="1" class="input-num" required />
              <p
                v-if="selectedProduct && form.quantity > (selectedProduct.stockQuantity || 0)"
                class="text-xs text-amber-600 mt-1"
              >
                Qty melebihi stok ({{ formatNumber(selectedProduct.stockQuantity) }}). Penjualan tetap tercatat, stok bisa minus sampai produksi selesai.
              </p>
            </div>
            <div>
              <label class="label">Fee marketplace (%)</label>
              <input v-model.number="form.marketplaceFeePercent" type="number" min="0" max="100" step="0.1" class="input-num" />
            </div>
          </div>

          <div>
            <div class="flex items-end justify-between gap-2 mb-1">
              <label class="label !mb-0">Harga jual / unit</label>
              <button
                v-if="selectedProduct?.hasRecipe"
                type="button"
                class="text-xs font-medium text-accent-600 hover:text-accent-700"
                @click="applySuggestedPrice"
              >
                Pakai harga saran
              </button>
            </div>
            <IdrInput v-model="form.salePricePerUnit" required />
          </div>

          <div>
            <label class="label">Catatan</label>
            <input v-model="form.notes" class="input" placeholder="opsional — mis. nama pembeli / no. pesanan" />
          </div>
        </div>

        <!-- Ringkasan transaksi -->
        <div class="lg:col-span-2">
          <div class="rounded-panel border border-ink-200 bg-ink-50 p-3 space-y-2 text-sm lg:sticky lg:top-2">
            <div class="panel-title">Ringkasan</div>
            <dl class="space-y-1.5">
              <div class="flex justify-between gap-2">
                <dt class="text-ink-500">Revenue kotor</dt>
                <dd class="font-mono">{{ formatIDR(preview.gross) }}</dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-ink-500">Fee marketplace</dt>
                <dd class="font-mono text-red-600">− {{ formatIDR(preview.fee) }}</dd>
              </div>
              <div class="flex justify-between gap-2 pt-1.5 border-t border-ink-200">
                <dt class="text-ink-600 font-medium">Revenue bersih</dt>
                <dd class="font-mono font-semibold text-teal-600">{{ formatIDR(preview.net) }}</dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-ink-500">HPP ({{ preview.qty }} unit)</dt>
                <dd class="font-mono text-red-600">
                  <span v-if="preview.hasHpp">− {{ formatIDR(preview.cogs) }}</span>
                  <span v-else class="text-ink-400">—</span>
                </dd>
              </div>
              <div class="flex justify-between gap-2 pt-1.5 border-t border-ink-200">
                <dt class="font-medium">Margin bersih</dt>
                <dd class="font-mono font-bold" :class="preview.margin >= 0 ? 'text-green-600' : 'text-red-600'">
                  {{ formatIDR(preview.margin) }}
                </dd>
              </div>
              <div v-if="preview.hasHpp && preview.net" class="flex justify-between gap-2">
                <dt class="text-ink-500">Margin %</dt>
                <dd class="font-mono" :class="preview.margin >= 0 ? 'text-green-600' : 'text-red-600'">
                  {{ preview.marginPercent }}%
                </dd>
              </div>
            </dl>
            <div v-if="belowCost" class="flex gap-2 rounded bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              <ExclamationTriangleIcon class="w-4 h-4 shrink-0" />
              <span>Harga jual di bawah HPP + fee — transaksi ini rugi.</span>
            </div>
          </div>
        </div>

        <div class="lg:col-span-5 space-y-2">
          <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" @click="showForm = false"><XMarkIcon class="w-4 h-4" />Batal</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              <CheckIcon class="w-4 h-4" />{{ saving ? 'Menyimpan…' : 'Simpan Penjualan' }}
            </button>
          </div>
        </div>
      </form>
    </AppModal>
  </div>
</template>
