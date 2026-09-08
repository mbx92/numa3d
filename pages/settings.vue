<script setup>
import { CheckIcon, ArrowPathIcon, DevicePhoneMobileIcon, DeviceTabletIcon, ComputerDesktopIcon } from '@heroicons/vue/24/outline'
import {
  DEFAULT_UI_LAYOUT_MODES,
  DEVICE_TIERS,
  DEVICE_TIER_LABELS,
  DEVICE_TIER_HINTS,
  LAYOUT_MODE_OPTIONS,
  detectDeviceTier,
  normalizeUiLayoutModes
} from '~/utils/uiLayoutModes.js'

const { data: settings, refresh } = await useFetch('/api/settings')
const form = ref({
  invoiceBusinessName: 'Numa3D',
  invoiceAddress: '',
  invoicePhone: '',
  invoiceFooter: '',
  invoiceShareTtlDays: 7,
  priceRoundStep: 500,
  uiLayoutModes: { ...DEFAULT_UI_LAYOUT_MODES },
  ...settings.value
})
const savedMsg = ref('')
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const tabs = computed(() => {
  const list = [
    { id: 'umum', label: 'Umum' },
    { id: 'tampilan', label: 'Tampilan' },
    { id: 'integrasi', label: 'Integrasi' },
    { id: 'invoice', label: 'Invoice' },
    { id: 'hpp', label: 'Perhitungan HPP' }
  ]
  if (isAdmin.value) {
    list.push({ id: 'user', label: 'User' }, { id: 'audit', label: 'Log aktivitas' })
  }
  return list
})
const formTabs = new Set(['umum', 'tampilan', 'invoice', 'hpp'])
const currentViewportTier = ref('desktop')
const currentViewportWidth = ref(0)

function syncViewport() {
  if (!import.meta.client) return
  currentViewportWidth.value = window.innerWidth
  currentViewportTier.value = detectDeviceTier(window.innerWidth)
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport, { passive: true })
})

onUnmounted(() => {
  if (import.meta.client) window.removeEventListener('resize', syncViewport)
})

watch(
  settings,
  (value) => {
    if (!value) return
    Object.assign(form.value, value, {
      uiLayoutModes: normalizeUiLayoutModes(value.uiLayoutModes)
    })
  },
  { immediate: true }
)

const deviceIcons = {
  iphone: DevicePhoneMobileIcon,
  ipad: DeviceTabletIcon,
  macbook: ComputerDesktopIcon,
  desktop: ComputerDesktopIcon
}
const route = useRoute()
const router = useRouter()
const tab = computed({
  get() {
    const id = String(route.query.tab || 'umum')
    return tabs.value.some((t) => t.id === id) ? id : 'umum'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  }
})

async function save() {
  await $fetch('/api/settings', {
    method: 'PUT',
    body: {
      ...form.value,
      uiLayoutModes: normalizeUiLayoutModes(form.value.uiLayoutModes)
    }
  })
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
  <div class="space-y-4" :class="tab === 'user' || tab === 'audit' ? 'max-w-5xl' : tab === 'tampilan' ? 'max-w-3xl' : 'max-w-2xl'">
    <h1 class="text-xl font-bold">Pengaturan</h1>
    <p v-if="!isAdmin" class="text-xs text-ink-500">Read-only — hanya admin yang bisa mengubah pengaturan.</p>

    <div class="tab-bar -mb-px">
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

    <form v-if="formTabs.has(tab)" class="panel p-4 space-y-4" @submit.prevent="save">
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

      <template v-else-if="tab === 'tampilan'">
        <p class="text-xs text-ink-500">
          Atur layout editor generator (Clicker, Keychain, Lightbox) untuk setiap kategori perangkat.
          Mode diterapkan otomatis berdasarkan lebar layar saat ini.
        </p>
        <div class="rounded-panel border border-accent-200 bg-accent-50/60 px-3 py-2 text-xs text-accent-900">
          Perangkat terdeteksi sekarang:
          <strong>{{ DEVICE_TIER_LABELS[currentViewportTier] }}</strong>
          ({{ currentViewportWidth }} px) —
          mode aktif:
          <strong>{{ LAYOUT_MODE_OPTIONS[currentViewportTier]?.find((m) => m.id === form.uiLayoutModes?.[currentViewportTier])?.label }}</strong>
        </div>
        <div class="space-y-3">
          <div
            v-for="tier in DEVICE_TIERS"
            :key="tier"
            class="rounded-panel border border-ink-200 p-3 space-y-2"
          >
            <div class="flex items-start gap-3">
              <div class="rounded-lg bg-ink-100 p-2 text-ink-600">
                <component :is="deviceIcons[tier]" class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-semibold text-ink-800">{{ DEVICE_TIER_LABELS[tier] }}</h3>
                  <span
                    v-if="currentViewportTier === tier"
                    class="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-800"
                  >
                    perangkat ini
                  </span>
                </div>
                <p class="text-[11px] text-ink-500">{{ DEVICE_TIER_HINTS[tier] }}</p>
              </div>
            </div>
            <div>
              <label class="label">Mode layout</label>
              <select
                v-model="form.uiLayoutModes[tier]"
                class="input text-sm"
                :disabled="!isAdmin"
              >
                <option v-for="mode in LAYOUT_MODE_OPTIONS[tier]" :key="mode.id" :value="mode.id">
                  {{ mode.label }}
                </option>
              </select>
              <p class="text-[11px] text-ink-500 mt-1">
                {{ LAYOUT_MODE_OPTIONS[tier]?.find((m) => m.id === form.uiLayoutModes[tier])?.description }}
              </p>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="tab === 'invoice'">
        <p class="text-xs text-ink-500">
          Kop invoice memakai nama, alamat, dan telepon dari tab Umum.
        </p>
        <div>
          <label class="label">Catatan kaki invoice</label>
          <textarea
            v-model="form.invoiceFooter"
            class="input min-h-[7rem]"
            rows="5"
            :disabled="!isAdmin"
            placeholder="Terima kasih telah berbelanja.&#10;BCA 1234567890 a.n. Numa3D"
          ></textarea>
          <p class="text-xs text-ink-500 mt-1">Bisa beberapa baris — rekening, QRIS, atau catatan lain. Tampil di bawah total invoice.</p>
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
          <div class="text-ink-500 text-xs pt-2 whitespace-pre-line">{{ form.invoiceFooter || 'Terima kasih telah berbelanja.' }}</div>
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
          <p class="text-xs text-ink-500 mt-1">
            Margin atas harga jual, bukan markup HPP. Harga saran = HPP ÷ (1 − margin%), lalu dibulatkan.
          </p>
        </div>
        <div>
          <label class="label">Pembulatan harga saran</label>
          <select v-model.number="form.priceRoundStep" class="input" :disabled="!isAdmin">
            <option :value="100">Ke atas Rp 100</option>
            <option :value="500">Ke atas Rp 500</option>
            <option :value="1000">Ke atas Rp 1.000</option>
          </select>
          <p class="text-xs text-ink-500 mt-1">Dipakai katalog, tombol harga saran, dan custom order.</p>
        </div>
      </template>

      <div v-if="isAdmin" class="flex items-center gap-3 pt-1">
        <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan</button>
        <span v-if="savedMsg" class="text-sm text-green-600">{{ savedMsg }}</span>
      </div>
    </form>

    <div v-else-if="tab === 'user'">
      <SettingsUsers />
    </div>
    <div v-else-if="tab === 'audit'">
      <SettingsAuditLog />
    </div>
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
