<script setup>
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
  BanknotesIcon,
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
const paymentLabel = { unpaid: 'Belum bayar', paid: 'Lunas' }
const paymentMethodLabel = {
  cash: 'Tunai',
  transfer: 'Transfer',
  marketplace: 'Cair marketplace',
  other: 'Lainnya'
}
const marketplaceChannels = new Set(['tokopedia', 'shopee', 'tiktok_shop'])
function defaultPaymentStatus(channel) {
  return marketplaceChannels.has(channel) ? 'unpaid' : 'paid'
}
function defaultPaymentMethod(channel, status) {
  if (status !== 'paid') return ''
  return marketplaceChannels.has(channel) ? 'marketplace' : 'cash'
}

const filters = ref({ productId: '', channel: '', paymentStatus: '', dateFrom: '', dateTo: '' })
function setThisMonth() {
  filters.value.dateFrom = monthStartStr()
  filters.value.dateTo = todayStr()
}
function clearFilters() {
  filters.value = { productId: '', channel: '', paymentStatus: '', dateFrom: '', dateTo: '' }
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
    fee: rows.reduce((a, r) => a + (r.grossRevenue - r.netRevenue), 0),
    net: rows.reduce((a, r) => a + r.netRevenue, 0),
    unpaid: rows.filter((r) => r.paymentStatus === 'unpaid').reduce((a, r) => a + r.netRevenue, 0)
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
    customerName: '',
    notes: '',
    discountAmount: 0,
    discountKind: 'amount',
    discountPercent: 0,
    paymentNotes: '',
    paymentStatus: defaultPaymentStatus('direct'),
    paymentMethod: 'cash',
    paidAt: todayStr(),
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
  const afterFee = Math.max(gross - fee, 0)
  const discount =
    form.value.discountKind === 'percent'
      ? Math.round(afterFee * (Math.min(Math.max(Number(form.value.discountPercent) || 0, 0), 100) / 100))
      : Math.min(Math.max(Math.round(Number(form.value.discountAmount) || 0), 0), afterFee)
  const net = afterFee - discount
  const cogs = hppPerUnit * qty
  const margin = net - cogs
  return {
    qty,
    hppPerUnit,
    hasHpp: !!selectedProduct.value?.hasRecipe,
    gross,
    fee,
    discount,
    net,
    cogs,
    margin,
    marginPercent: net ? Math.round((margin / net) * 100) : 0,
    netPerUnit: qty ? Math.round(net / qty) : 0
  }
})
const belowCost = computed(() => preview.value.hasHpp && preview.value.qty > 0 && preview.value.margin < 0)

function applySuggestedPrice() {
  const price = selectedProduct.value?.sellingPrice || 0
  if (price) form.value.salePricePerUnit = price
}

watch(
  () => form.value.channel,
  (ch) => {
    if (showForm.value && ch) {
      form.value.marketplaceFeePercent = defaultFee[ch] ?? 0
      form.value.paymentStatus = defaultPaymentStatus(ch)
      form.value.paymentMethod = defaultPaymentMethod(ch, form.value.paymentStatus)
    }
  }
)
watch(
  () => form.value.paymentStatus,
  (status) => {
    if (!showForm.value) return
    if (status === 'paid') {
      if (!form.value.paidAt) form.value.paidAt = form.value.date || todayStr()
      if (!form.value.paymentMethod) form.value.paymentMethod = defaultPaymentMethod(form.value.channel, 'paid')
    }
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
function afterFeeOfSale(s) {
  const gross = (s.salePricePerUnit || 0) * (s.quantity || 0)
  const fee = Math.round(gross * ((s.marketplaceFeePercent || 0) / 100))
  return { gross, fee, afterFee: Math.max(gross - fee, 0) }
}
function discountLine(s) {
  if (!s.discountAmount) return ''
  if (s.discountKind === 'percent') return `diskon ${s.discountPercent}% (${formatIDR(s.discountAmount)})`
  return `diskon ${formatIDR(s.discountAmount)}`
}

async function markPaid(s) {
  payTarget.value = s
  payForm.value = {
    paymentMethod: defaultPaymentMethod(s.channel, 'paid'),
    paidAt: todayStr(),
    discountKind: s.discountKind === 'percent' ? 'percent' : 'amount',
    discountAmount: s.discountAmount || 0,
    discountPercent: s.discountPercent || 0,
    paymentNotes: s.paymentNotes || ''
  }
  payError.value = ''
}
const payTarget = ref(null)
const payForm = ref({})
const payError = ref('')
const paySaving = ref(false)
const payPreview = computed(() => {
  const s = payTarget.value
  if (!s) return null
  const { gross, fee, afterFee } = afterFeeOfSale(s)
  const discount =
    payForm.value.discountKind === 'percent'
      ? Math.round(afterFee * (Math.min(Math.max(Number(payForm.value.discountPercent) || 0, 0), 100) / 100))
      : Math.min(Math.max(Math.round(Number(payForm.value.discountAmount) || 0), 0), afterFee)
  return { gross, fee, afterFee, discount, net: afterFee - discount }
})
function setDiscountKind(target, kind) {
  const afterFee = target === 'pay' ? payPreview.value?.afterFee || 0 : preview.value ? Math.max(preview.value.gross - preview.value.fee, 0) : 0
  const formRef = target === 'pay' ? payForm : form
  if (formRef.value.discountKind === kind) return
  if (kind === 'percent') {
    formRef.value.discountPercent = afterFee
      ? Math.min(100, Math.round(((Number(formRef.value.discountAmount) || 0) / afterFee) * 1000) / 10)
      : 0
  } else {
    const p = Math.min(Math.max(Number(formRef.value.discountPercent) || 0, 0), 100)
    formRef.value.discountAmount = Math.round(afterFee * (p / 100))
  }
  formRef.value.discountKind = kind
}
function closePay() {
  payTarget.value = null
  payError.value = ''
}
async function submitPay() {
  const s = payTarget.value
  if (!s) return
  paySaving.value = true
  payError.value = ''
  try {
    await $fetch(`/api/sales/${s.id}/payment`, {
      method: 'PUT',
      body: {
        paymentStatus: 'paid',
        paymentMethod: payForm.value.paymentMethod,
        paidAt: payForm.value.paidAt,
        discountKind: payForm.value.discountKind,
        discountAmount: payForm.value.discountAmount,
        discountPercent: payForm.value.discountPercent,
        paymentNotes: payForm.value.paymentNotes
      }
    })
    closePay()
    await refresh()
    useToast().success('Pembayaran dicatat.')
  } catch (e) {
    payError.value = e.data?.statusMessage || 'Gagal mencatat pembayaran'
  } finally {
    paySaving.value = false
  }
}
async function markUnpaid(s) {
  try {
    await $fetch(`/api/sales/${s.id}/payment`, { method: 'PUT', body: { paymentStatus: 'unpaid' } })
    await refresh()
    useToast().success('Ditandai belum bayar.')
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal memperbarui pembayaran')
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
        <div class="min-w-0 lg:w-36">
          <label class="label">Pembayaran</label>
          <select v-model="filters.paymentStatus" class="input">
            <option value="">Semua</option>
            <option value="unpaid">Belum bayar</option>
            <option value="paid">Lunas</option>
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
          <button type="button" class="btn-secondary flex-1 lg:flex-none" @click="setThisMonth">
            <CalendarDaysIcon class="w-3.5 h-3.5" />Bulan ini
          </button>
          <button type="button" class="btn-secondary flex-1 lg:flex-none" @click="clearFilters">
            <ArrowPathIcon class="w-3.5 h-3.5" />Reset
          </button>
        </div>
      </div>
    </div>

    <!-- Running totals -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Unit terjual</div>
        <div class="font-mono text-lg sm:text-xl font-semibold">{{ formatNumber(totals.units) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Revenue kotor</div>
        <div class="font-mono text-lg sm:text-xl font-semibold">{{ formatIDR(totals.gross) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Fee marketplace</div>
        <div class="font-mono text-lg sm:text-xl font-semibold text-red-600">{{ formatIDR(totals.fee) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Revenue bersih</div>
        <div class="font-mono text-lg sm:text-xl font-semibold text-teal-600">{{ formatIDR(totals.net) }}</div>
      </div>
      <div class="panel p-3">
        <div class="text-xs text-ink-500 uppercase font-semibold">Belum dibayar</div>
        <div class="font-mono text-lg sm:text-xl font-semibold text-amber-600">{{ formatIDR(totals.unpaid) }}</div>
      </div>
    </div>

    <!-- Kartu (mobile) -->
    <div class="md:hidden space-y-2">
      <div v-for="s in paged" :key="s.id" class="panel p-3 space-y-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-medium break-words">
              {{ s.productName }}
              <span v-if="s.isCustom" class="badge bg-ink-100 text-ink-500 ml-1">custom</span>
            </div>
            <div class="text-xs font-mono text-ink-500">{{ formatDate(s.date) }}<span v-if="s.invoiceNumber"> · {{ s.invoiceNumber }}</span></div>
            <div v-if="s.customerName" class="text-xs text-ink-500">{{ s.customerName }}</div>
          </div>
          <span class="badge bg-ink-100 text-ink-600 shrink-0">{{ channelLabel[s.channel] }}</span>
        </div>
        <div class="flex flex-wrap gap-1">
          <span
            class="badge"
            :class="s.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'"
          >
            {{ paymentLabel[s.paymentStatus] || 'Belum bayar' }}
          </span>
          <span v-if="s.paymentStatus === 'paid' && s.paymentMethod" class="badge bg-ink-100 text-ink-600">
            {{ paymentMethodLabel[s.paymentMethod] || s.paymentMethod }}
          </span>
        </div>
        <div v-if="s.notes" class="text-xs text-ink-400">{{ s.notes }}</div>
        <div v-if="s.paymentStatus === 'paid' && s.discountAmount" class="text-xs text-ink-400">{{ discountLine(s) }}</div>
        <div v-if="s.paymentNotes" class="text-xs text-ink-400 break-words">{{ s.paymentNotes }}</div>
        <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm pt-1">
          <div class="flex justify-between"><dt class="text-ink-500">Qty</dt><dd class="font-mono">{{ s.quantity }}</dd></div>
          <div class="flex justify-between"><dt class="text-ink-500">Harga</dt><dd class="font-mono">{{ formatIDR(s.salePricePerUnit) }}</dd></div>
          <div class="flex justify-between"><dt class="text-ink-500">Fee</dt><dd class="font-mono">{{ s.marketplaceFeePercent ? s.marketplaceFeePercent + '%' : '–' }}</dd></div>
          <div class="flex justify-between">
            <dt class="text-ink-500">Bersih</dt>
            <dd class="font-mono">{{ formatIDR(s.netRevenue) }}</dd>
          </div>
        </dl>
        <div class="pt-1 flex flex-wrap gap-1">
          <NuxtLink :to="`/sales/${s.id}/invoice`" class="btn-secondary">
            <PrinterIcon class="w-3.5 h-3.5" />Invoice
          </NuxtLink>
          <button v-if="s.paymentStatus !== 'paid'" class="btn-secondary" @click="markPaid(s)">
            <BanknotesIcon class="w-3.5 h-3.5" />Lunas
          </button>
          <button v-else class="btn-secondary" @click="markUnpaid(s)">Belum bayar</button>
          <button class="btn-danger" @click="remove(s)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
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
              <th>Bayar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in paged" :key="s.id">
              <td class="whitespace-nowrap font-mono text-xs">{{ formatDate(s.date) }}</td>
              <td class="font-medium">
                {{ s.productName }}
                <span v-if="s.isCustom" class="badge bg-ink-100 text-ink-500 ml-1">custom</span>
                <div v-if="s.customerName" class="text-xs text-ink-500">{{ s.customerName }}</div>
                <div v-if="s.notes" class="text-xs text-ink-400">{{ s.notes }}</div>
              </td>
              <td><span class="badge bg-ink-100 text-ink-600">{{ channelLabel[s.channel] }}</span></td>
              <td class="num">{{ s.quantity }}</td>
              <td class="num">{{ formatIDR(s.salePricePerUnit) }}</td>
              <td class="num text-ink-500">{{ s.marketplaceFeePercent ? s.marketplaceFeePercent + '%' : '-' }}</td>
              <td class="num">{{ formatIDR(s.netPricePerUnit) }}</td>
              <td>
                <span
                  class="badge"
                  :class="s.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'"
                >
                  {{ paymentLabel[s.paymentStatus] || 'Belum bayar' }}
                </span>
                <div v-if="s.paymentStatus === 'paid'" class="text-xs text-ink-400 mt-0.5">
                  {{ paymentMethodLabel[s.paymentMethod] || s.paymentMethod || '—' }}
                  <span v-if="s.paidAt"> · {{ formatDate(s.paidAt) }}</span>
                  <span v-if="s.discountAmount"> · {{ discountLine(s) }}</span>
                </div>
                <div v-if="s.paymentNotes" class="text-xs text-ink-400 mt-0.5 break-words">{{ s.paymentNotes }}</div>
              </td>
              <td class="text-right whitespace-nowrap">
                <NuxtLink :to="`/sales/${s.id}/invoice`" class="btn-secondary">
                  <PrinterIcon class="w-4 h-4" />Invoice
                </NuxtLink>
                <button v-if="s.paymentStatus !== 'paid'" class="btn-secondary ml-1" @click="markPaid(s)">
                  <BanknotesIcon class="w-4 h-4" />Lunas
                </button>
                <button class="btn-danger ml-1" @click="remove(s)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
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

    <!-- Form catat penjualan: input di kiri, ringkasan revenue di kanan -->
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
                Produk ini belum punya recipe — harga saran tidak tersedia.
              </p>
              <p v-else class="text-xs text-ink-500">
                HPP {{ formatIDR(selectedProduct.hpp) }} / unit
                <span v-if="selectedProduct.sellingPrice">
                  · jual {{ formatIDR(selectedProduct.sellingPrice) }}{{ selectedProduct.listPrice ? '' : ' (saran)' }}
                </span>
                · stok {{ formatNumber(selectedProduct.stockQuantity) }}
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
                v-if="selectedProduct?.sellingPrice"
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
            <label class="label">Nama pelanggan</label>
            <input v-model="form.customerName" class="input" placeholder="untuk invoice — opsional" />
          </div>

          <div>
            <label class="label">Catatan</label>
            <input v-model="form.notes" class="input" placeholder="opsional — mis. no. pesanan marketplace" />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="label">Status bayar</label>
              <select v-model="form.paymentStatus" class="input">
                <option value="unpaid">Belum dibayar</option>
                <option value="paid">Sudah dibayar</option>
              </select>
            </div>
            <div v-if="form.paymentStatus === 'paid'" class="sm:col-span-2">
              <label class="label">Diskon</label>
              <div class="flex gap-2">
                <div class="inline-flex rounded-panel border border-ink-200 overflow-hidden shrink-0 h-10">
                  <button
                    type="button"
                    class="px-2.5 text-sm"
                    :class="form.discountKind === 'amount' ? 'bg-ink-100 text-ink-800' : 'text-ink-500 hover:bg-ink-50'"
                    @click="setDiscountKind('form', 'amount')"
                  >
                    Rp
                  </button>
                  <button
                    type="button"
                    class="px-2.5 text-sm border-l border-ink-200"
                    :class="form.discountKind === 'percent' ? 'bg-ink-100 text-ink-800' : 'text-ink-500 hover:bg-ink-50'"
                    @click="setDiscountKind('form', 'percent')"
                  >
                    %
                  </button>
                </div>
                <IdrInput v-if="form.discountKind !== 'percent'" v-model="form.discountAmount" input-class="w-full" />
                <input
                  v-else
                  v-model.number="form.discountPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  class="input-num flex-1"
                />
              </div>
              <p class="text-xs text-ink-400 mt-1">Rp atau % dari nilai setelah fee marketplace.</p>
            </div>
            <div v-if="form.paymentStatus === 'paid'" class="sm:col-span-2">
              <label class="label">Catatan pembayaran</label>
              <textarea v-model="form.paymentNotes" class="input min-h-[4rem]" rows="2" placeholder="opsional — mis. transfer BCA / potong voucher"></textarea>
            </div>
            <div v-if="form.paymentStatus === 'paid'">
              <label class="label">Metode</label>
              <select v-model="form.paymentMethod" class="input">
                <option value="cash">Tunai</option>
                <option value="transfer">Transfer</option>
                <option value="marketplace">Cair marketplace</option>
                <option value="other">Lainnya</option>
              </select>
            </div>
            <div v-if="form.paymentStatus === 'paid'" class="date-field">
              <label class="label">Tanggal bayar</label>
              <input v-model="form.paidAt" type="date" class="input" />
            </div>
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
              <div v-if="preview.discount" class="flex justify-between gap-2">
                <dt class="text-ink-500">
                  Diskon
                  <span v-if="form.discountKind === 'percent'" class="font-normal">({{ form.discountPercent }}%)</span>
                </dt>
                <dd class="font-mono text-red-600">− {{ formatIDR(preview.discount) }}</dd>
              </div>
              <div class="flex justify-between gap-2 pt-1.5 border-t border-ink-200">
                <dt class="text-ink-600 font-medium">Revenue bersih</dt>
                <dd class="font-mono font-semibold text-teal-600">{{ formatIDR(preview.net) }}</dd>
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

    <AppModal v-if="payTarget" title="Catat pembayaran" @close="closePay">
      <form class="space-y-3" @submit.prevent="submitPay">
        <div class="rounded-panel border border-ink-200 bg-ink-50 p-3">
          <div class="panel-title mb-2">Item</div>
          <div class="flex gap-3">
            <div class="w-16 h-16 rounded-panel border border-ink-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
              <img
                v-if="payTarget.productId && payTarget.imageKey"
                :src="`/api/products/${payTarget.productId}/image`"
                alt=""
                class="w-full h-full object-cover"
              />
              <PhotoIcon v-else class="w-6 h-6 text-ink-300" />
            </div>
            <div class="min-w-0 flex-1 space-y-0.5">
              <div class="font-medium break-words">
                {{ payTarget.productName }}
                <span v-if="payTarget.isCustom" class="badge bg-ink-100 text-ink-500 ml-1">custom</span>
              </div>
              <div class="text-xs text-ink-500">
                {{ formatDate(payTarget.date) }}
                <span v-if="payTarget.invoiceNumber"> · {{ payTarget.invoiceNumber }}</span>
              </div>
              <div v-if="payTarget.customerName" class="text-xs text-ink-500">{{ payTarget.customerName }}</div>
              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                <span class="badge bg-white border border-ink-200 text-ink-600">{{ channelLabel[payTarget.channel] }}</span>
                <span class="text-xs font-mono text-ink-600">
                  {{ payTarget.quantity }} × {{ formatIDR(payTarget.salePricePerUnit) }}
                </span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-xs text-ink-400">Subtotal</div>
              <div class="font-mono font-semibold">{{ formatIDR((payTarget.salePricePerUnit || 0) * (payTarget.quantity || 0)) }}</div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="label">Metode</label>
            <select v-model="payForm.paymentMethod" class="input" required>
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer</option>
              <option value="marketplace">Cair marketplace</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div class="date-field">
            <label class="label">Tanggal bayar</label>
            <input v-model="payForm.paidAt" type="date" class="input" required />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Diskon</label>
            <div class="flex gap-2">
              <div class="inline-flex rounded-panel border border-ink-200 overflow-hidden shrink-0 h-10">
                <button
                  type="button"
                  class="px-2.5 text-sm"
                  :class="payForm.discountKind === 'amount' ? 'bg-ink-100 text-ink-800' : 'text-ink-500 hover:bg-ink-50'"
                  @click="setDiscountKind('pay', 'amount')"
                >
                  Rp
                </button>
                <button
                  type="button"
                  class="px-2.5 text-sm border-l border-ink-200"
                  :class="payForm.discountKind === 'percent' ? 'bg-ink-100 text-ink-800' : 'text-ink-500 hover:bg-ink-50'"
                  @click="setDiscountKind('pay', 'percent')"
                >
                  %
                </button>
              </div>
              <IdrInput v-if="payForm.discountKind !== 'percent'" v-model="payForm.discountAmount" input-class="w-full" />
              <input
                v-else
                v-model.number="payForm.discountPercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                class="input-num flex-1"
              />
            </div>
            <p class="text-xs text-ink-400 mt-1">Rp atau % dari nilai setelah fee marketplace.</p>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Catatan pembayaran</label>
            <textarea v-model="payForm.paymentNotes" class="input min-h-[4rem]" rows="2" placeholder="opsional — mis. transfer BCA / potong voucher"></textarea>
          </div>
        </div>
        <dl v-if="payPreview" class="rounded-panel border border-ink-200 bg-ink-50 p-3 space-y-1.5 text-sm">
          <div class="panel-title">Detail pembayaran</div>
          <div class="flex justify-between gap-2">
            <dt class="text-ink-500">Subtotal</dt>
            <dd class="font-mono">{{ formatIDR(payPreview.gross) }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-ink-500">Fee marketplace</dt>
            <dd class="font-mono text-red-600">− {{ formatIDR(payPreview.fee) }}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-ink-500">
              Diskon
              <span v-if="payForm.discountKind === 'percent'" class="font-normal">({{ payForm.discountPercent }}%)</span>
            </dt>
            <dd class="font-mono text-red-600">− {{ formatIDR(payPreview.discount) }}</dd>
          </div>
          <div class="flex justify-between gap-2 pt-1.5 border-t border-ink-200">
            <dt class="font-medium">Diterima</dt>
            <dd class="font-mono font-semibold text-teal-600">{{ formatIDR(payPreview.net) }}</dd>
          </div>
        </dl>
        <p v-if="payError" class="text-sm text-red-600">{{ payError }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="closePay"><XMarkIcon class="w-4 h-4" />Batal</button>
          <button type="submit" class="btn-primary" :disabled="paySaving">
            <CheckIcon class="w-4 h-4" />{{ paySaving ? 'Menyimpan…' : 'Simpan lunas' }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
