<script setup>
import { CheckIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'

const { data: settings, refresh } = await useFetch('/api/settings')
const form = ref({
  invoiceBusinessName: 'Numa3D',
  invoiceAddress: '',
  invoicePhone: '',
  invoiceFooter: '',
  ...settings.value
})
const savedMsg = ref('')
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

async function save() {
  await $fetch('/api/settings', { method: 'PUT', body: form.value })
  await refresh()
  savedMsg.value = 'Pengaturan tersimpan.'
  setTimeout(() => (savedMsg.value = ''), 3000)
}

// Status MinIO (penyimpanan file 3D)
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
</script>

<template>
  <div class="space-y-4 max-w-xl">
    <h1 class="text-xl font-bold">Pengaturan</h1>

    <div class="panel">
      <div class="panel-header"><span class="panel-title">Parameter Perhitungan HPP</span></div>
      <p v-if="!isAdmin" class="px-4 pt-3 text-xs text-ink-500">Read-only — hanya admin yang bisa mengubah pengaturan.</p>
      <form class="p-4 space-y-4" @submit.prevent="save">
        <div>
          <label class="label">Tarif listrik (Rp / kWh)</label>
          <IdrInput v-model="form.electricityRatePerKwh" required :disabled="!isAdmin" />
          <p class="text-xs text-ink-500 mt-1">Tarif PLN rumah tangga 1.300–2.200 VA ± Rp 1.445/kWh.</p>
        </div>
        <div>
          <label class="label">Asumsi pemakaian mesin (jam / bulan)</label>
          <input v-model.number="form.machineUsageHoursPerMonth" type="number" min="1" class="input-num" required :disabled="!isAdmin" />
          <p class="text-xs text-ink-500 mt-1">
            Dipakai untuk depresiasi per jam = harga beli ÷ masa depresiasi (bulan) ÷ jam pakai per bulan.
          </p>
        </div>
        <div>
          <label class="label">Target margin default (%)</label>
          <input v-model.number="form.defaultMarginPercent" type="number" min="0" max="95" class="input-num" required :disabled="!isAdmin" />
        </div>
        <div class="pt-2 border-t border-ink-200">
          <div class="panel-title mb-3">Identitas invoice</div>
          <div class="space-y-3">
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
            <div>
              <label class="label">Catatan kaki invoice</label>
              <input v-model="form.invoiceFooter" class="input" :disabled="!isAdmin" placeholder="Terima kasih telah berbelanja." />
            </div>
          </div>
        </div>
        <div v-if="isAdmin" class="flex items-center gap-3">
          <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan</button>
          <span v-if="savedMsg" class="text-sm text-green-600">{{ savedMsg }}</span>
        </div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Status MinIO (Penyimpanan File 3D)</span>
        <button class="btn-secondary !py-1 text-xs" :disabled="minioFetchStatus === 'pending'" @click="refreshMinio">
          <ArrowPathIcon class="w-3.5 h-3.5" />Cek Ulang
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
            <dd class="font-mono">{{ minioStatus?.endpoint }}{{ minioStatus?.useSSL ? ' (SSL)' : '' }}</dd>
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
      </div>
    </div>
  </div>
</template>
