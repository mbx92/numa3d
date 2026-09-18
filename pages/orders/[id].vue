<script setup>
import { ArrowLeftIcon, CheckIcon, PlayIcon, TruckIcon, PrinterIcon, XMarkIcon, QueueListIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'

const route = useRoute()
const id = route.params.id
const { data: order, refresh } = await useFetch(`/api/orders/${id}`)
const busy = ref(false)
const editing = ref(false)
const editForm = ref({})
const statusLabel = {
  draft: 'Draft', confirmed: 'Antrian produksi', in_production: 'Sedang diproduksi',
  ready: 'Siap diserahkan', completed: 'Selesai', cancelled: 'Batal'
}
const statusBadge = {
  draft: 'bg-ink-100 text-ink-600', confirmed: 'bg-blue-100 text-blue-700',
  in_production: 'bg-amber-100 text-amber-800', ready: 'bg-teal-100 text-teal-800',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-ink-100 text-ink-400'
}
const productionLabel = { queued: 'Antrian', in_progress: 'Proses', done: 'Selesai', cancelled: 'Batal' }
const activeProduction = computed(() => order.value?.productions?.some((job) => job.status === 'queued' || job.status === 'in_progress'))
const needsProduction = computed(() =>
  order.value?.status === 'confirmed' &&
  !activeProduction.value &&
  (order.value?.item?.quantityReserved || 0) < (order.value?.item?.quantity || 0)
)

async function action(path, success) {
  busy.value = true
  try {
    await $fetch(`/api/orders/${id}/${path}`, { method: 'POST' })
    await refresh()
    if (success) useToast().success(success)
  } catch (error) {
    useToast().error(error.data?.statusMessage || 'Aksi gagal')
  } finally {
    busy.value = false
  }
}

async function confirmOrder() {
  if (!(await useConfirm().confirm('Konfirmasi order dan reservasi stok? Kekurangan stok otomatis masuk antrian produksi.', { title: 'Konfirmasi order', confirmText: 'Konfirmasi' }))) return
  await action('confirm', 'Order dikonfirmasi')
}

function openEdit() {
  editForm.value = {
    date: order.value.date,
    customerName: order.value.customerName,
    channel: order.value.channel,
    productId: order.value.item.productId,
    quantity: order.value.item.quantity,
    pricePerUnit: order.value.item.pricePerUnit,
    notes: order.value.notes || ''
  }
  editing.value = true
}

async function saveEdit() {
  busy.value = true
  try {
    await $fetch(`/api/orders/${id}`, { method: 'PUT', body: editForm.value })
    editing.value = false
    await refresh()
    useToast().success('Draft order diperbarui')
  } catch (error) {
    useToast().error(error.data?.statusMessage || 'Gagal memperbarui order')
  } finally {
    busy.value = false
  }
}
async function queueRemaining() {
  await action('production', 'Kekurangan unit masuk antrian produksi')
}
async function cancelOrder() {
  if (!(await useConfirm().confirm('Batalkan order ini?', { title: 'Batalkan order', confirmText: 'Batalkan' }))) return
  await action('cancel', 'Order dibatalkan')
}
async function deliver() {
  if (!(await useConfirm().confirm(`Serahkan ${order.value.item.quantity} unit kepada ${order.value.customerName} dan catat sebagai penjualan?`, { title: 'Serah terima', confirmText: 'Serahkan' }))) return
  await action('deliver', 'Order selesai dan penjualan tercatat')
}
</script>

<template>
  <div v-if="order" class="space-y-4 max-w-4xl">
    <div class="flex items-start gap-3">
      <NuxtLink to="/orders" class="btn-secondary mt-0.5"><ArrowLeftIcon class="w-4 h-4" /></NuxtLink>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-bold">Order #{{ order.id }}</h1>
        <p class="text-sm text-ink-500">{{ order.customerName }} · {{ formatDate(order.date) }}</p>
      </div>
      <span class="badge shrink-0" :class="statusBadge[order.status]">{{ statusLabel[order.status] }}</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Permintaan</span></div>
        <div class="p-4 text-sm space-y-2">
          <div class="flex justify-between gap-3"><span class="text-ink-500">Produk</span><NuxtLink :to="`/products/${order.item.productId}`" class="font-medium text-right hover:underline">{{ order.item.product.name }}</NuxtLink></div>
          <div class="flex justify-between gap-3"><span class="text-ink-500">Jumlah</span><span class="font-mono">{{ order.item.quantity }} unit</span></div>
          <div class="flex justify-between gap-3"><span class="text-ink-500">Harga / unit</span><span class="font-mono">{{ formatIDR(order.item.pricePerUnit) }}</span></div>
          <div class="flex justify-between gap-3 border-t border-ink-100 pt-2"><span class="font-medium">Total</span><span class="font-mono font-semibold">{{ formatIDR(order.item.quantity * order.item.pricePerUnit) }}</span></div>
          <div class="flex justify-between gap-3"><span class="text-ink-500">Stok direservasi</span><span class="font-mono">{{ order.item.quantityReserved }} / {{ order.item.quantity }}</span></div>
          <p v-if="order.notes" class="text-xs text-ink-500 pt-1">{{ order.notes }}</p>
          <div class="flex flex-wrap gap-2 pt-2">
            <button v-if="order.status === 'draft'" class="btn-secondary" :disabled="busy" @click="openEdit"><PencilSquareIcon class="w-4 h-4" />Ubah</button>
            <button v-if="order.status === 'draft'" class="btn-primary" :disabled="busy" @click="confirmOrder"><CheckIcon class="w-4 h-4" />Konfirmasi order</button>
            <button v-if="needsProduction" class="btn-primary" :disabled="busy" @click="queueRemaining"><PlayIcon class="w-4 h-4" />Antrikan sisa</button>
            <button v-if="order.status === 'ready'" class="btn-primary" :disabled="busy" @click="deliver"><TruckIcon class="w-4 h-4" />Serah terima</button>
            <NuxtLink v-if="order.sale" :to="`/sales/${order.sale.id}/invoice`" class="btn-secondary"><PrinterIcon class="w-4 h-4" />Invoice</NuxtLink>
            <button v-if="!['completed', 'cancelled'].includes(order.status)" class="btn-danger" :disabled="busy" @click="cancelOrder"><XMarkIcon class="w-4 h-4" />Batalkan</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header flex items-center justify-between"><span class="panel-title">Produksi</span><NuxtLink to="/production" class="text-xs text-accent-600"><QueueListIcon class="w-4 h-4 inline" /> Antrian</NuxtLink></div>
        <div v-if="order.productions?.length" class="divide-y divide-ink-100">
          <div v-for="job in order.productions" :key="job.id" class="p-4 text-sm space-y-1">
            <div class="flex justify-between gap-2"><span class="font-medium">Produksi #{{ job.id }}</span><span class="badge">{{ productionLabel[job.status] }}</span></div>
            <div class="text-xs text-ink-500 font-mono">rencana {{ job.quantityPlanned }} · jadi {{ job.quantityGood }} · gagal {{ job.quantityFailed }}</div>
          </div>
        </div>
        <div v-else class="p-6 text-sm text-ink-500 text-center">
          {{ order.status === 'draft' ? 'Produksi dibuat setelah order dikonfirmasi.' : 'Order dipenuhi dari stok tersedia.' }}
        </div>
      </div>
    </div>

    <AppModal v-if="editing" title="Ubah draft order" @close="editing = false">
      <form class="space-y-3" @submit.prevent="saveEdit">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Tanggal</label><input v-model="editForm.date" type="date" class="input" required /></div>
          <div><label class="label">Channel</label><select v-model="editForm.channel" class="input"><option value="tokopedia">Tokopedia</option><option value="shopee">Shopee</option><option value="tiktok_shop">TikTok Shop</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="direct">Langsung</option><option value="other">Lainnya</option></select></div>
        </div>
        <div><label class="label">Pelanggan</label><input v-model="editForm.customerName" class="input" required /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Jumlah</label><input v-model.number="editForm.quantity" type="number" min="1" class="input-num" required /></div>
          <div><label class="label">Harga / unit</label><IdrInput v-model="editForm.pricePerUnit" required /></div>
        </div>
        <div><label class="label">Catatan</label><input v-model="editForm.notes" class="input" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" @click="editing = false">Batal</button><button type="submit" class="btn-primary" :disabled="busy">Simpan</button></div>
      </form>
    </AppModal>
  </div>
</template>
