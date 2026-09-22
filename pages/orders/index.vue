<script setup>
import { PlusIcon, EyeIcon } from '@heroicons/vue/24/outline'
import { productKindLabel, productKindBadge } from '#shared/utils/productKind.js'

const statusLabel = {
  draft: 'Draft',
  confirmed: 'Antrian',
  in_production: 'Produksi',
  ready: 'Siap serah',
  completed: 'Selesai',
  cancelled: 'Batal'
}
const statusBadge = {
  draft: 'bg-ink-100 text-ink-600',
  confirmed: 'bg-blue-100 text-blue-700',
  in_production: 'bg-amber-100 text-amber-800',
  ready: 'bg-teal-100 text-teal-800',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-ink-100 text-ink-400'
}
const channelLabel = {
  tokopedia: 'Tokopedia', shopee: 'Shopee', tiktok_shop: 'TikTok Shop',
  instagram: 'Instagram', whatsapp: 'WhatsApp', direct: 'Langsung', other: 'Lainnya'
}

const route = useRoute()
const router = useRouter()
const filters = ref({ status: '', dateFrom: '', dateTo: '' })
const query = computed(() => Object.fromEntries(Object.entries(filters.value).filter(([, value]) => value)))
const { data: orders, refresh } = await useFetch('/api/orders', { query })
const { data: products } = await useFetch('/api/products')
const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  computed(() => orders.value || []),
  10
)
watch(query, reset, { deep: true })

const showForm = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const form = ref({})
const selectedProduct = computed(() =>
  (products.value || []).find((product) => Number(product.id) === Number(form.value.productId))
)

function productPrice(product) {
  return product?.listPrice || product?.sellingPrice || product?.suggestedPrice || 0
}

function openAdd(productId = null) {
  const selected = (products.value || []).find((product) => Number(product.id) === Number(productId))
    || products.value?.find((product) => product.status === 'active')
    || products.value?.[0]
  form.value = {
    date: todayStr(),
    customerName: '',
    channel: 'whatsapp',
    productId: selected?.id || '',
    quantity: 1,
    pricePerUnit: productPrice(selected),
    notes: ''
  }
  errorMsg.value = ''
  showForm.value = true
}

watch(
  () => form.value.productId,
  (id, previous) => {
    if (!showForm.value || !id || id === previous) return
    form.value.pricePerUnit = productPrice(selectedProduct.value)
  }
)

onMounted(() => {
  if (route.query.new === '1' || route.query.productId) {
    openAdd(route.query.productId)
    router.replace({ query: {} })
  }
})

async function save() {
  saving.value = true
  errorMsg.value = ''
  try {
    const order = await $fetch('/api/orders', { method: 'POST', body: form.value })
    showForm.value = false
    await navigateTo(`/orders/${order.id}`)
  } catch (error) {
    errorMsg.value = error.data?.statusMessage || 'Gagal menyimpan order'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-1">
          <h1 class="text-xl font-bold">Order</h1>
          <InfoTooltip label="Informasi Order">Permintaan pelanggan sebelum masuk produksi dan penjualan.</InfoTooltip>
        </div>

      </div>
      <button class="btn-primary" @click="openAdd()"><PlusIcon class="w-4 h-4" />Order baru</button>
    </div>

    <div class="panel p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div>
        <label class="label">Status</label>
        <select v-model="filters.status" class="input">
          <option value="">Semua</option>
          <option v-for="(label, key) in statusLabel" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
      <div><label class="label">Dari</label><input v-model="filters.dateFrom" type="date" class="input" /></div>
      <div><label class="label">Sampai</label><input v-model="filters.dateTo" type="date" class="input" /></div>
    </div>

    <div class="md:hidden space-y-2">
      <NuxtLink v-for="order in paged" :key="order.id" :to="`/orders/${order.id}`" class="panel p-3 block space-y-1">
        <div class="flex items-start justify-between gap-2">
          <span class="font-medium break-words">#{{ order.id }} · {{ order.productName }}</span>
          <span class="badge shrink-0" :class="statusBadge[order.status]">{{ statusLabel[order.status] }}</span>
        </div>
        <span class="badge" :class="productKindBadge[order.productKind || 'normal']">{{ productKindLabel[order.productKind || 'normal'] }}</span>
        <div class="text-xs text-ink-500">{{ order.customerName }} · {{ formatDate(order.date) }}</div>
        <div class="text-xs font-mono text-ink-400">{{ order.quantity }} unit · {{ formatIDR(order.pricePerUnit) }}/unit</div>
      </NuxtLink>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada order.</p>
    </div>

    <div class="panel hidden md:block">
      <div class="overflow-x-auto">
        <table class="table-std">
          <thead><tr><th>Tanggal</th><th>Order</th><th>Pelanggan</th><th>Produk</th><th class="text-right">Qty</th><th class="text-right">Nilai</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr v-for="order in paged" :key="order.id">
              <td class="font-mono text-xs whitespace-nowrap">{{ formatDate(order.date) }}</td>
              <td class="font-mono">#{{ order.id }}</td>
              <td>{{ order.customerName }}<div class="text-xs text-ink-400">{{ channelLabel[order.channel] }}</div></td>
              <td>{{ order.productName }}<div><span class="badge text-[10px]" :class="productKindBadge[order.productKind || 'normal']">{{ productKindLabel[order.productKind || 'normal'] }}</span></div></td>
              <td class="num">{{ order.quantity }}</td>
              <td class="num">{{ formatIDR(order.quantity * order.pricePerUnit) }}</td>
              <td><span class="badge" :class="statusBadge[order.status]">{{ statusLabel[order.status] }}</span></td>
              <td class="text-right"><NuxtLink :to="`/orders/${order.id}`" class="btn-secondary"><EyeIcon class="w-4 h-4" />Detail</NuxtLink></td>
            </tr>
            <tr v-if="!total"><td colspan="8" class="text-center text-ink-500 py-6">Belum ada order.</td></tr>
          </tbody>
        </table>
      </div>
      <AppPagination v-if="total" v-model:page="page" v-model:pageSize="pageSize" :total-pages="totalPages" :total="total" :range-start="rangeStart" :range-end="rangeEnd" />
    </div>

    <AppModal v-if="showForm" title="Order baru" @close="showForm = false">
      <form class="space-y-3" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Tanggal</label><input v-model="form.date" type="date" class="input" required /></div>
          <div><label class="label">Channel</label><select v-model="form.channel" class="input"><option v-for="(label, key) in channelLabel" :key="key" :value="key">{{ label }}</option></select></div>
        </div>
        <div><label class="label">Pelanggan</label><input v-model="form.customerName" class="input" required placeholder="nama pelanggan / toko" /></div>
        <div><label class="label">Produk</label><ProductPicker v-model="form.productId" :products="products || []" :disabled="saving" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Jumlah</label><input v-model.number="form.quantity" type="number" min="1" class="input-num" required /></div>
          <div><label class="label">Harga / unit</label><IdrInput v-model="form.pricePerUnit" required /></div>
        </div>
        <p v-if="selectedProduct" class="text-xs text-ink-500"><span class="badge mr-1" :class="productKindBadge[selectedProduct.kind || 'normal']">{{ productKindLabel[selectedProduct.kind || 'normal'] }}</span> Stok fisik {{ formatNumber(selectedProduct.stockQuantity) }} · reservasi {{ formatNumber(selectedProduct.reservedQuantity) }} · bebas {{ formatNumber(selectedProduct.availableStock) }} · HPP {{ formatIDR(selectedProduct.hpp || 0) }}</p>
        <div><label class="label">Catatan</label><input v-model="form.notes" class="input" placeholder="opsional" /></div>
        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" @click="showForm = false">Batal</button><button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Menyimpan…' : 'Simpan draft' }}</button></div>
      </form>
    </AppModal>
  </div>
</template>
