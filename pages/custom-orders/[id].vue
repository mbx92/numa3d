<script setup>
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  CheckIcon,
  PlayIcon,
  PencilSquareIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'

const route = useRoute()
const id = route.params.id
const { data: order, refresh } = await useFetch(`/api/custom-orders/${id}`)
const { data: materials } = await useFetch('/api/materials')
const { data: machines } = await useFetch('/api/machines')
const { data: packagingItems } = await useFetch('/api/packaging')

const statusLabel = {
  open: 'Proses',
  ready: 'Siap serah',
  delivered: 'Diserahkan',
  cancelled: 'Batal'
}
const prodLabel = {
  queued: 'Antrian',
  in_progress: 'Proses',
  done: 'Selesai',
  cancelled: 'Batal'
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

const fileInput = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const completeOpen = ref(false)
const completeForm = ref({ good: 0, failed: 0 })
const completeError = ref('')
const completeSaving = ref(false)
const delivering = ref(false)
const editing = ref(false)
const form = ref({})
const saving = ref(false)
const errorMsg = ref('')

const files = computed(() => order.value?.files || [])
const job = computed(() => order.value?.production)
const canEdit = computed(() => order.value && order.value.status !== 'delivered')

function isModel(name) {
  return /\.(stl|obj|3mf|glb|gltf)$/i.test(name || '')
}
function isImage(name) {
  return /\.(png|jpe?g|webp)$/i.test(name || '')
}
function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}
function formatMinutes(total) {
  const n = Math.max(Math.round(Number(total) || 0), 0)
  if (!n) return '—'
  const h = Math.floor(n / 60)
  const m = n % 60
  if (h && m) return `${h}j ${m} mnt`
  if (h) return `${h} jam`
  return `${m} mnt`
}

function startEdit() {
  const o = order.value
  form.value = {
    date: o.date,
    customerName: o.customerName,
    title: o.title,
    channel: o.channel,
    quantity: o.quantity,
    pricePerUnit: o.pricePerUnit,
    materialId: o.materialId,
    materialQuantityUsed: o.materialQuantityUsed,
    packagingId: o.packagingId || '',
    packagingQuantityUsed: o.packagingQuantityUsed,
    machineId: o.machineId || '',
    printTimeMinutes: o.printTimeMinutes,
    notes: o.notes || ''
  }
  errorMsg.value = ''
  editing.value = true
}

async function saveEdit() {
  saving.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/custom-orders/${id}`, {
      method: 'PUT',
      body: {
        ...form.value,
        machineId: form.value.machineId || null,
        packagingId: form.value.packagingId || null
      }
    })
    editing.value = false
    await refresh()
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  } finally {
    saving.value = false
  }
}

function uploadOne(file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const data = new FormData()
    data.append('file', file)
    xhr.open('POST', `/api/custom-orders/${id}/files`)
    xhr.withCredentials = true
    xhr.onload = () => {
      let body = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body?.statusMessage || `Upload gagal (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Koneksi upload gagal'))
    xhr.send(data)
  })
}

async function uploadFiles(event) {
  const selected = Array.from(event?.target?.files || [])
  if (!selected.length) return
  uploading.value = true
  uploadError.value = ''
  const errors = []
  try {
    for (const file of selected) {
      try {
        await uploadOne(file)
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`)
      }
    }
    await refresh()
    if (errors.length) uploadError.value = errors.join('\n')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function deleteFile(f) {
  if (!(await useConfirm().confirm(`Hapus file "${f.filename}"?`))) return
  await $fetch(`/api/custom-order-files/${f.id}`, { method: 'DELETE' })
  await refresh()
}

function jobPayload(extra = {}) {
  const j = job.value
  return {
    date: extra.date ?? j.date,
    productId: null,
    customOrderId: Number(id),
    machineId: extra.machineId ?? j.machineId,
    quantityPlanned: extra.quantityPlanned ?? j.quantityPlanned,
    quantityGood: extra.quantityGood ?? j.quantityGood,
    quantityFailed: extra.quantityFailed ?? j.quantityFailed,
    status: extra.status ?? j.status,
    notes: extra.notes ?? j.notes
  }
}

async function setStatus(status) {
  try {
    await $fetch(`/api/productions/${job.value.id}`, { method: 'PUT', body: jobPayload({ status }) })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal mengubah status')
  }
}

function openComplete() {
  completeForm.value = { good: job.value.quantityPlanned, failed: 0 }
  completeError.value = ''
  completeOpen.value = true
}

watch(
  () => completeForm.value.good,
  (n) => {
    if (!completeOpen.value || !job.value) return
    completeForm.value.failed = Math.max((job.value.quantityPlanned || 0) - Math.max(Math.round(Number(n) || 0), 0), 0)
  }
)

async function submitComplete() {
  const good = Math.max(Math.round(Number(completeForm.value.good) || 0), 0)
  const failed = Math.max(Math.round(Number(completeForm.value.failed) || 0), 0)
  if (good + failed <= 0) {
    completeError.value = 'Isi jumlah jadi atau gagal'
    return
  }
  const ok = await useConfirm().confirm(
    good
      ? `Selesaikan cetak? ${good} unit jadi untuk pelanggan (tidak masuk stok produk)${failed ? `, ${failed} gagal` : ''}.`
      : 'Semua gagal. Stok produk tidak berubah, material tetap terpotong.',
    { title: 'Konfirmasi hasil produksi', confirmText: 'Ya, selesaikan', danger: !good }
  )
  if (!ok) return
  completeSaving.value = true
  try {
    await $fetch(`/api/productions/${job.value.id}`, {
      method: 'PUT',
      body: jobPayload({ status: 'done', quantityGood: good, quantityFailed: failed })
    })
    completeOpen.value = false
    await refresh()
    useToast().success(good ? `${good} unit siap diserahkan` : 'Produksi ditandai gagal')
  } catch (e) {
    completeError.value = e.data?.statusMessage || 'Gagal menyelesaikan'
  } finally {
    completeSaving.value = false
  }
}

async function recreateProduction() {
  try {
    await $fetch(`/api/custom-orders/${id}/production`, { method: 'POST' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal membuat produksi')
  }
}

async function deliver() {
  const ok = await useConfirm().confirm(
    `Serahkan ke ${order.value.customerName}? ${job.value.quantityGood} unit tercatat sebagai penjualan jasa cetak, stok produk tidak berubah.`,
    { title: 'Serah terima', confirmText: 'Ya, serahkan', danger: false }
  )
  if (!ok) return
  delivering.value = true
  try {
    await $fetch(`/api/custom-orders/${id}/deliver`, { method: 'POST' })
    await refresh()
    useToast().success('Penjualan custom tercatat')
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menyerahkan')
  } finally {
    delivering.value = false
  }
}
</script>

<template>
  <div v-if="order" class="space-y-4">
    <div class="flex items-start gap-3">
      <NuxtLink to="/custom-orders" class="btn-secondary !p-2 mt-0.5"><ArrowLeftIcon class="w-4 h-4" /></NuxtLink>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-bold break-words">{{ order.title }}</h1>
        <p class="text-sm text-ink-500">{{ order.customerName }} · {{ formatDate(order.date) }} · {{ channelLabel[order.channel] }}</p>
      </div>
      <span class="badge shrink-0" :class="order.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'">
        {{ statusLabel[order.status] }}
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="panel">
        <div class="panel-header flex items-center justify-between">
          <span class="panel-title">Data pesanan</span>
          <button v-if="canEdit && !editing" class="btn-secondary !py-1 !px-2 text-xs" @click="startEdit">
            <PencilSquareIcon class="w-3.5 h-3.5" />Edit
          </button>
        </div>
        <div v-if="!editing" class="p-4 text-sm space-y-1">
          <div class="flex justify-between gap-2"><span class="text-ink-500">Jumlah</span><span class="font-mono">{{ order.quantity }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-ink-500">Harga / unit</span><span class="font-mono">{{ formatIDR(order.pricePerUnit) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-ink-500">Material</span><span>{{ order.materialName }} · {{ formatNumber(order.materialQuantityUsed, 1) }} {{ order.materialUnit }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-ink-500">Packaging</span><span>{{ order.packagingName || '—' }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-ink-500">Mesin</span><span>{{ order.machineName || '—' }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-ink-500">Durasi / unit</span><span>{{ formatMinutes(order.printTimeMinutes) }}</span></div>
          <div class="flex justify-between gap-2"><span class="text-ink-500">HPP estimasi</span><span class="font-mono">{{ formatIDR(order.hpp) }}</span></div>
          <p v-if="order.notes" class="text-xs text-ink-400 pt-2">{{ order.notes }}</p>
        </div>
        <form v-else class="p-4 space-y-3" @submit.prevent="saveEdit">
          <input v-model="form.customerName" class="input" required placeholder="Pelanggan" />
          <input v-model="form.title" class="input" required placeholder="Judul desain" />
          <div class="grid grid-cols-2 gap-2">
            <input v-model="form.date" type="date" class="input" required />
            <select v-model="form.channel" class="input">
              <option v-for="(label, key) in channelLabel" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <input v-model.number="form.quantity" type="number" min="1" class="input-num" />
            <IdrInput v-model="form.pricePerUnit" />
          </div>
          <select v-model="form.materialId" class="input">
            <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <input v-model.number="form.materialQuantityUsed" type="number" min="0" step="0.1" class="input-num" />
          <div class="grid grid-cols-2 gap-2">
            <select v-model="form.machineId" class="input">
              <option value="">Mesin —</option>
              <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
            <input v-model.number="form.printTimeMinutes" type="number" min="0" class="input-num" />
          </div>
          <select v-model="form.packagingId" class="input">
            <option value="">Packaging —</option>
            <option v-for="p in packagingItems" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input v-model="form.notes" class="input" placeholder="Catatan" />
          <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" @click="editing = false"><XMarkIcon class="w-4 h-4" />Batal</button>
            <button type="submit" class="btn-primary" :disabled="saving"><CheckIcon class="w-4 h-4" />Simpan</button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header"><span class="panel-title">Produksi</span></div>
        <div class="p-4 space-y-3 text-sm">
          <template v-if="job">
            <div class="flex justify-between"><span class="text-ink-500">Status</span><span>{{ prodLabel[job.status] }}</span></div>
            <div class="flex justify-between"><span class="text-ink-500">Rencana</span><span class="font-mono">{{ job.quantityPlanned }}</span></div>
            <div v-if="job.status === 'done'" class="flex justify-between"><span class="text-ink-500">Jadi / gagal</span><span class="font-mono">{{ job.quantityGood }} / {{ job.quantityFailed }}</span></div>
            <p class="text-xs text-ink-400">Estimasi {{ formatMinutes(job.durationMinutes) }}. Unit jadi tidak masuk stok produk.</p>
            <div class="flex flex-wrap gap-1">
              <button v-if="job.status === 'queued'" class="btn-secondary !py-1 !px-2 text-xs" @click="setStatus('in_progress')">
                <PlayIcon class="w-3.5 h-3.5" />Mulai
              </button>
              <button
                v-if="job.status === 'queued' || job.status === 'in_progress'"
                class="btn-primary !py-1 !px-2 text-xs"
                @click="openComplete"
              >
                <CheckIcon class="w-3.5 h-3.5" />Selesai
              </button>
              <NuxtLink to="/production" class="btn-secondary !py-1 !px-2 text-xs">Lihat antrian</NuxtLink>
              <button
                v-if="order.status === 'ready' && job.quantityGood > 0"
                class="btn-primary !py-1 !px-2 text-xs"
                :disabled="delivering"
                @click="deliver"
              >
                Serah terima
              </button>
              <NuxtLink
                v-if="order.sale"
                :to="`/sales/${order.sale.id}/invoice`"
                class="btn-secondary !py-1 !px-2 text-xs"
              >
                Invoice
              </NuxtLink>
            </div>
          </template>
          <template v-else>
            <p class="text-ink-500">Belum ada job produksi.</p>
            <button v-if="canEdit" class="btn-primary !py-1 !px-2 text-xs" @click="recreateProduction">Buat produksi</button>
          </template>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header flex items-center justify-between">
        <span class="panel-title">File desain</span>
        <label class="btn-secondary !py-1 !px-2 text-xs cursor-pointer">
          <ArrowUpTrayIcon class="w-3.5 h-3.5" />{{ uploading ? 'Mengunggah…' : 'Unggah' }}
          <input ref="fileInput" type="file" multiple class="hidden" :disabled="uploading" @change="uploadFiles" />
        </label>
      </div>
      <p class="px-4 pt-3 text-xs text-ink-500">STL, OBJ, 3MF, GLB, gambar, PDF, atau ZIP. Maks 100 MB per file.</p>
      <p v-if="uploadError" class="px-4 pt-2 text-sm text-red-600 whitespace-pre-line">{{ uploadError }}</p>
      <ul v-if="files.length" class="divide-y divide-ink-100">
        <li v-for="f in files" :key="f.id" class="p-4 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-mono text-sm break-all">{{ f.filename }}</div>
              <div class="text-xs text-ink-400">{{ formatSize(f.sizeBytes) }}</div>
            </div>
            <div class="flex gap-2 shrink-0">
              <a :href="`/api/custom-order-files/${f.id}?download=1`" class="text-xs text-teal-600">
                <ArrowDownTrayIcon class="w-4 h-4 inline" /> Unduh
              </a>
              <button class="text-xs text-red-500" @click="deleteFile(f)"><TrashIcon class="w-4 h-4 inline" /> Hapus</button>
            </div>
          </div>
          <img
            v-if="isImage(f.filename)"
            :src="`/api/custom-order-files/${f.id}`"
            alt=""
            class="max-h-48 rounded border border-ink-200 object-contain bg-ink-50"
          />
          <ClientOnly v-else-if="isModel(f.filename)">
            <ModelViewer :src="`/api/custom-order-files/${f.id}`" :filename="f.filename" class="h-56 rounded border border-ink-200" />
          </ClientOnly>
        </li>
      </ul>
      <p v-else class="p-6 text-sm text-ink-500 text-center">Belum ada file.</p>
    </div>

    <AppModal v-if="completeOpen" title="Hasil produksi" @close="completeOpen = false">
      <div class="space-y-3">
        <p class="text-sm">Rencana {{ job.quantityPlanned }} unit · tidak masuk stok produk.</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Unit jadi</label>
            <input v-model.number="completeForm.good" type="number" min="0" class="input-num" />
          </div>
          <div>
            <label class="label">Unit gagal</label>
            <input v-model.number="completeForm.failed" type="number" min="0" class="input-num" />
          </div>
        </div>
        <p v-if="completeError" class="text-sm text-red-600">{{ completeError }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" type="button" @click="completeOpen = false">Batal</button>
          <button class="btn-primary" type="button" :disabled="completeSaving" @click="submitComplete">Konfirmasi selesai</button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
