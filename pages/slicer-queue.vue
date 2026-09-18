<script setup>
import { ArrowPathIcon, StopIcon, TrashIcon } from '@heroicons/vue/24/outline'

const statusLabel = {
  queued: 'Menunggu', processing: 'Diproses', completed: 'Selesai', failed: 'Gagal', cancelled: 'Dibatalkan'
}
const statusBadge = {
  queued: 'bg-ink-200 text-ink-700', processing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700', cancelled: 'bg-ink-100 text-ink-500'
}
const toolLabel = { keychain: 'Keychain', clicker: 'Clicker', 'qr-plate': 'QR Plate' }
const authUser = useState('authUser')
const isAdmin = computed(() => authUser.value?.role === 'admin')
const filter = ref('')
const { data: jobs, refresh } = await useFetch('/api/slicer/jobs')
const { data: worker, refresh: refreshWorker } = await useFetch('/api/slicer/status')
const filteredJobs = computed(() => filter.value ? (jobs.value || []).filter((job) => job.status === filter.value) : (jobs.value || []))
const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(filteredJobs, 15)
watch(filter, reset)

const counts = computed(() => {
  const value = { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 }
  for (const job of jobs.value || []) value[job.status] = (value[job.status] || 0) + 1
  return value
})
let timer
onMounted(() => {
  timer = setInterval(() => {
    if (!document.hidden) Promise.all([refresh(), refreshWorker()])
  }, 3000)
})
onUnmounted(() => clearInterval(timer))

function duration(job) {
  if (!job.startedAt) return '—'
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now()
  const seconds = Math.max(Math.round((end - new Date(job.startedAt).getTime()) / 1000), 0)
  return seconds < 60 ? `${seconds} dtk` : `${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`
}

function resultText(job) {
  if (!job.result) return '—'
  const seconds = Math.round(job.result.printTimeSeconds || 0)
  return `${formatNumber(job.result.totalGrams || 0, 2)} g · ${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`
}

async function reload() {
  await Promise.all([refresh(), refreshWorker()])
}

async function cancel(job) {
  if (!(await useConfirm().confirm(`Batalkan job slicing #${job.id}?`, { title: 'Batalkan slicing', confirmText: 'Batalkan', danger: true }))) return
  try {
    await $fetch(`/api/slicer/jobs/${job.id}/cancel`, { method: 'POST' })
    await refresh()
  } catch (error) { useToast().error(error.data?.statusMessage || 'Gagal membatalkan job') }
}

async function retry(job) {
  try {
    await $fetch(`/api/slicer/jobs/${job.id}/retry`, { method: 'POST' })
    await refresh()
    useToast().success(`Job #${job.id} kembali ke antrean`)
  } catch (error) { useToast().error(error.data?.statusMessage || 'Gagal mengulang job') }
}

async function remove(job) {
  if (!(await useConfirm().confirm(`Hapus job slicing #${job.id} dan file sementaranya?`))) return
  try {
    await $fetch(`/api/slicer/jobs/${job.id}`, { method: 'DELETE' })
    await refresh()
  } catch (error) { useToast().error(error.data?.statusMessage || 'Gagal menghapus job') }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-bold">Antrian Slicer</h1>
      <p class="text-xs text-ink-500 mt-1">Job generator diproses oleh worker OrcaSlicer terpisah. Halaman diperbarui otomatis setiap 3 detik.</p>
    </div>

    <div class="panel p-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium" :class="worker?.ready ? 'text-emerald-700' : 'text-red-700'">{{ worker?.message || 'Memeriksa worker…' }}</p>
        <p class="text-xs text-ink-400">{{ worker?.workerId || 'Belum ada worker aktif' }}</p>
      </div>
      <button class="btn-secondary" @click="reload"><ArrowPathIcon class="w-4 h-4" />Muat ulang</button>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
      <button v-for="(label, key) in statusLabel" :key="key" class="panel p-3 text-left" :class="filter === key ? 'ring-2 ring-accent-500' : ''" @click="filter = filter === key ? '' : key">
        <div class="text-lg font-semibold font-mono">{{ counts[key] || 0 }}</div>
        <div class="text-xs text-ink-500">{{ label }}</div>
      </button>
    </div>

    <div class="md:hidden space-y-2">
      <article v-for="job in paged" :key="job.id" class="panel p-3 space-y-2">
        <div class="flex justify-between gap-2">
          <div><p class="font-medium">#{{ job.id }} · {{ toolLabel[job.tool] || job.tool }}</p><p class="text-xs text-ink-500 break-all">{{ job.filename }}</p></div>
          <span class="badge shrink-0" :class="statusBadge[job.status]">{{ statusLabel[job.status] }}</span>
        </div>
        <div v-if="job.status === 'processing'" class="space-y-1">
          <div class="h-1.5 rounded bg-ink-100 overflow-hidden"><div class="h-full bg-accent-500" :style="{ width: `${job.progress || 5}%` }" /></div>
          <p class="text-xs text-ink-500">{{ job.stage }}</p>
        </div>
        <p v-if="job.result" class="text-xs font-mono">{{ resultText(job) }}</p>
        <p v-if="job.error" class="text-xs text-red-700 break-words">{{ job.error }}</p>
        <div class="flex flex-wrap gap-1">
          <button v-if="['queued', 'processing'].includes(job.status)" class="btn-danger" @click="cancel(job)"><StopIcon class="w-4 h-4" />Batalkan</button>
          <button v-if="['failed', 'cancelled'].includes(job.status) && job.attempts < job.maxAttempts" class="btn-secondary" @click="retry(job)"><ArrowPathIcon class="w-4 h-4" />Ulang</button>
          <button v-if="isAdmin && job.status !== 'processing'" class="btn-secondary" @click="remove(job)"><TrashIcon class="w-4 h-4" />Hapus</button>
        </div>
      </article>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">Belum ada job slicing.</p>
    </div>

    <div class="panel hidden md:block overflow-x-auto">
      <table class="table-std">
        <thead><tr><th>Job</th><th>Pemilik</th><th>Status</th><th>Durasi</th><th>Hasil</th><th>Percobaan</th><th></th></tr></thead>
        <tbody>
          <tr v-for="job in paged" :key="job.id">
            <td><div class="font-medium">#{{ job.id }} · {{ toolLabel[job.tool] || job.tool }}</div><div class="text-xs text-ink-400 max-w-[16rem] truncate">{{ job.filename }}</div></td>
            <td class="text-ink-500">{{ job.username || 'user dihapus' }}</td>
            <td class="min-w-[12rem]">
              <span class="badge" :class="statusBadge[job.status]">{{ statusLabel[job.status] }}</span>
              <div v-if="job.status === 'processing'" class="mt-1.5"><div class="h-1.5 rounded bg-ink-100 overflow-hidden"><div class="h-full bg-accent-500" :style="{ width: `${job.progress || 5}%` }" /></div></div>
              <div class="text-[11px] mt-1" :class="job.error ? 'text-red-700' : 'text-ink-400'">{{ job.error || job.stage }}</div>
            </td>
            <td class="font-mono text-xs">{{ duration(job) }}</td>
            <td class="font-mono text-xs">{{ resultText(job) }}</td>
            <td class="font-mono text-xs">{{ job.attempts }}/{{ job.maxAttempts }}</td>
            <td class="whitespace-nowrap text-right">
              <button v-if="['queued', 'processing'].includes(job.status)" class="btn-danger" @click="cancel(job)"><StopIcon class="w-4 h-4" />Batalkan</button>
              <button v-if="['failed', 'cancelled'].includes(job.status) && job.attempts < job.maxAttempts" class="btn-secondary" @click="retry(job)"><ArrowPathIcon class="w-4 h-4" />Ulang</button>
              <button v-if="isAdmin && job.status !== 'processing'" class="btn-secondary ml-1" @click="remove(job)"><TrashIcon class="w-4 h-4" /></button>
            </td>
          </tr>
          <tr v-if="!total"><td colspan="7" class="text-center text-ink-500 py-6">Belum ada job slicing.</td></tr>
        </tbody>
      </table>
      <AppPagination v-if="total" v-model:page="page" v-model:pageSize="pageSize" :total-pages="totalPages" :total="total" :range-start="rangeStart" :range-end="rangeEnd" />
    </div>
  </div>
</template>
