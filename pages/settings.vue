<script setup>
import { CheckIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'

const { data: settings, refresh } = await useFetch('/api/settings')
const form = ref({
  invoiceBusinessName: 'Numa3D',
  invoiceAddress: '',
  invoicePhone: '',
  invoiceFooter: '',
  invoiceShareTtlDays: 7,
  ...settings.value
})
const savedMsg = ref('')
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const tabs = [
  { id: 'umum', label: 'Umum' },
  { id: 'integrasi', label: 'Integrasi' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'hpp', label: 'Perhitungan HPP' }
]
const route = useRoute()
const router = useRouter()
const tab = computed({
  get() {
    const id = String(route.query.tab || 'umum')
    return tabs.some((t) => t.id === id) ? id : 'umum'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  }
})

async function save() {
  await $fetch('/api/settings', { method: 'PUT', body: form.value })
  await refresh()
  Object.assign(form.value, settings.value)
  savedMsg.value = 'Pengaturan tersimpan.'
  setTimeout(() => (savedMsg.value = ''), 3000)
}

const { data: minioStatus, refresh: refreshMinio, status: minioFetchStatus } = await useFetch(
  '/api/system/minio-status'
)
const minioStatusLabel = computed(() => {
  if (!minioStatus.value) return 'Memeriksa…'
  if (!minioStatus.value.reachable) return 'Tidak terhubung'
  if (!minioStatus.value.bucketExists) return 'Terhubung — bucket belum dibuat (otomatis saat upload pertama)'
  return 'Terhubung & siap'
})
function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}

const {
  data: tuyaReady,
  refresh: refreshTuya,
  status: tuyaFetchStatus
} = await useFetch('/api/tuya/ready', { immediate: false })
watch(
  tab,
  (id) => {
    if (id === 'integrasi' && isAdmin.value) refreshTuya()
  },
  { immediate: true }
)
</script>

<template>
  <div class="space-y-4 max-w-2xl">
    <h1 class="text-xl font-bold">Pengaturan</h1>
    <p v-if="!isAdmin" class="text-xs text-ink-500">Read-only — hanya admin yang bisa mengubah pengaturan.</p>

    <div class="flex gap-1 overflow-x-auto border-b border-ink-200 -mb-px">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="tab === t.id ? 'border-accent-500 text-accent-700' : 'border-transparent text-ink-500 hover:text-ink-800'"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <form v-if="tab !== 'integrasi'" class="panel p-4 space-y-4" @submit.prevent="save">
      <template v-if="tab === 'umum'">
        <p class="text-xs text-ink-500">Identitas usaha dipakai di invoice dan tampilan internal.</p>
        <div>
          <label class="label">Nama usaha</label>
          <input v-model="form.invoiceBusinessName" class="input" :disabled="!isAdmin" placeholder="Numa3D" />
        </div>
        <div>
          <label class="label">Alamat</label>
          <textarea v-model="form.invoiceAddress" class="input min-h-[4.5rem]" :disabled="!isAdmin" placeholder="opsional" />
        </div>
        <div>
          <label class="label">Telepon / WhatsApp</label>
          <input v-model="form.invoicePhone" class="input" :disabled="!isAdmin" placeholder="opsional" />
        </div>
      </template>

      <template v-else-if="tab === 'invoice'">
        <p class="text-xs text-ink-500">
          Kop invoice memakai nama, alamat, dan telepon dari tab Umum.
        </p>
        <div>
          <label class="label">Catatan kaki invoice</label>
          <input v-model="form.invoiceFooter" class="input" :disabled="!isAdmin" placeholder="Terima kasih telah berbelanja." />
        </div>
        <div>
          <label class="label">Umur tautan bagikan (hari)</label>
          <input
            v-model.number="form.invoiceShareTtlDays"
            type="number"
            min="1"
            max="365"
            class="input-num"
            :disabled="!isAdmin"
          />
          <p class="text-xs text-ink-500 mt-1">
            Tautan publik dari tombol Bagikan berlaku selama ini (1–365 hari). Tautan yang sudah dibuat tidak berubah umurnya.
          </p>
        </div>
        <div class="rounded-panel border border-ink-200 bg-ink-50 p-3 text-sm space-y-1">
          <div class="font-semibold">{{ form.invoiceBusinessName || 'Numa3D' }}</div>
          <div v-if="form.invoiceAddress" class="text-ink-600 whitespace-pre-line text-xs">{{ form.invoiceAddress }}</div>
          <div v-if="form.invoicePhone" class="text-ink-600 text-xs">{{ form.invoicePhone }}</div>
          <div class="text-ink-500 text-xs pt-2">{{ form.invoiceFooter || 'Terima kasih telah berbelanja.' }}</div>
        </div>
      </template>

      <template v-else-if="tab === 'hpp'">
        <div>
          <label class="label">Tarif listrik (Rp / kWh)</label>
          <IdrInput v-model="form.electricityRatePerKwh" required :disabled="!isAdmin" />
          <p class="text-xs text-ink-500 mt-1">Tarif PLN rumah tangga 1.300–2.200 VA ± Rp 1.445/kWh.</p>
        </div>
        <div>
          <label class="label">Asumsi pemakaian mesin (jam / bulan)</label>
          <input
            v-model.number="form.machineUsageHoursPerMonth"
            type="number"
            min="1"
            class="input-num"
            required
            :disabled="!isAdmin"
          />
          <p class="text-xs text-ink-500 mt-1">
            Dipakai untuk depresiasi per jam = harga beli ÷ masa depresiasi (bulan) ÷ jam pakai per bulan.
          </p>
        </div>
        <div>
          <label class="label">Target margin default (%)</label>
          <input
            v-model.number="form.defaultMarginPercent"
            type="number"
            min="0"
            max="95"
            class="input-num"
            required
            :disabled="!isAdmin"
          />
          <p class="text-xs text-ink-500 mt-1">Prefill harga jual saran di produk dan penjualan.</p>
        </div>
      </template>

      <div v-if="isAdmin" class="flex items-center gap-3 pt-1">
        <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan</button>
        <span v-if="savedMsg" class="text-sm text-green-600">{{ savedMsg }}</span>
      </div>
    </form>

    <div v-else class="space-y-4">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">MinIO (file 3D)</span>
          <button class="btn-secondary" :disabled="minioFetchStatus === 'pending'" @click="refreshMinio">
            <ArrowPathIcon class="w-3.5 h-3.5" />Cek ulang
          </button>
        </div>
        <div class="p-4 space-y-3">
          <div class="flex items-center gap-2">
            <span
              class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              :class="minioStatus?.reachable && minioStatus?.bucketExists ? 'bg-green-500' : minioStatus?.reachable ? 'bg-amber-500' : 'bg-red-500'"
            ></span>
            <span class="text-sm font-medium">{{ minioStatusLabel }}</span>
          </div>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt class="text-xs uppercase text-ink-500">Endpoint</dt>
              <dd class="font-mono break-all">{{ minioStatus?.endpoint }}{{ minioStatus?.useSSL ? ' (SSL)' : '' }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-ink-500">Bucket</dt>
              <dd class="font-mono">{{ minioStatus?.bucket }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-ink-500">Latency</dt>
              <dd class="font-mono">{{ minioStatus?.latencyMs ?? '-' }} ms</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-ink-500">File tersimpan</dt>
              <dd class="font-mono">{{ minioStatus?.fileCount ?? 0 }} file · {{ formatBytes(minioStatus?.totalBytes) }}</dd>
            </div>
          </dl>
          <p v-if="minioStatus?.error" class="text-sm text-red-600">{{ minioStatus.error }}</p>
          <p class="text-xs text-ink-400">Kredensial diatur lewat environment (`MINIO_*`).</p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Tuya (smart plug)</span>
          <button
            v-if="isAdmin"
            class="btn-secondary"
            :disabled="tuyaFetchStatus === 'pending'"
            @click="refreshTuya"
          >
            <ArrowPathIcon class="w-3.5 h-3.5" />Cek ulang
          </button>
        </div>
        <div class="p-4 space-y-2 text-sm">
          <template v-if="isAdmin">
            <div class="flex items-center gap-2">
              <span
                class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                :class="tuyaReady?.ok ? 'bg-green-500' : 'bg-amber-500'"
              ></span>
              <span class="font-medium">{{ tuyaReady?.ok ? 'Library local Tuya siap' : 'Library belum siap / belum dicek' }}</span>
            </div>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <dt class="text-xs uppercase text-ink-500">Cloud API</dt>
                <dd>{{ tuyaReady?.cloudConfigured ? 'Terkonfigurasi' : 'Belum diisi' }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase text-ink-500">Region</dt>
                <dd class="font-mono">{{ tuyaReady?.region || '—' }}</dd>
              </div>
            </dl>
            <p v-if="tuyaReady?.error" class="text-sm text-red-600">{{ tuyaReady.error }}</p>
            <p class="text-xs text-ink-400">
              `TUYA_API_KEY` / `TUYA_API_SECRET` di environment. Pairing perangkat di halaman Mesin.
            </p>
          </template>
          <p v-else class="text-ink-500">Status Tuya hanya terlihat oleh admin.</p>
        </div>
      </div>
    </div>
  </div>
</template>
