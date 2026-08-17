<script setup>
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  BoltIcon,
  ArrowPathIcon
} from '@heroicons/vue/24/outline'

const { data: machines, refresh } = await useFetch('/api/machines')
const { data: settings } = await useFetch('/api/settings')
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')

const search = ref('')
const filteredMachines = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return machines.value || []
  return (machines.value || []).filter(
    (m) => m.name.toLowerCase().includes(q) || (m.notes || '').toLowerCase().includes(q)
  )
})
const { page, pageSize, paged, total, totalPages, rangeStart, rangeEnd, reset } = usePagination(
  filteredMachines,
  10
)
watch(search, reset)

const showForm = ref(false)
const editing = ref(null)
const form = ref({})
const errorMsg = ref('')
const live = ref({})
const probing = ref(false)
const scanning = ref(false)
const fetchingCloud = ref(false)
const scanResults = ref([])
const probeMsg = ref('')
const tuyaReady = ref(null)
const tuyaEnabled = ref(false)

function emptyTuya() {
  return { tuyaIp: '', tuyaDeviceId: '', tuyaLocalKey: '', tuyaVersion: 'auto' }
}
function openAdd() {
  editing.value = null
  form.value = {
    name: '',
    powerWatt: 0,
    purchasePrice: 0,
    purchaseDate: '',
    depreciationMonths: 36,
    notes: '',
    ...emptyTuya()
  }
  errorMsg.value = ''
  probeMsg.value = ''
  scanResults.value = []
  tuyaEnabled.value = false
  showForm.value = true
  loadTuyaReady()
}
function openEdit(m) {
  editing.value = m
  form.value = {
    ...m,
    purchaseDate: m.purchaseDate || '',
    tuyaIp: m.tuyaIp || '',
    tuyaDeviceId: m.tuyaDeviceId || '',
    tuyaLocalKey: '',
    tuyaVersion: m.tuyaVersion || 'auto'
  }
  errorMsg.value = ''
  probeMsg.value = ''
  scanResults.value = []
  tuyaEnabled.value = !!m.tuyaConfigured
  showForm.value = true
  loadTuyaReady()
}
async function save() {
  errorMsg.value = ''
  try {
    const body = { ...form.value }
    if (!tuyaEnabled.value) {
      Object.assign(body, emptyTuya(), { tuyaClear: true })
    }
    if (editing.value) {
      await $fetch(`/api/machines/${editing.value.id}`, { method: 'PUT', body })
      useToast().success('Mesin diperbarui.')
    } else {
      await $fetch('/api/machines', { method: 'POST', body })
      useToast().success('Mesin tersimpan.')
    }
    showForm.value = false
    editing.value = null
    await refresh()
    await refreshAllPower()
  } catch (e) {
    errorMsg.value = e.data?.statusMessage || 'Gagal menyimpan'
  }
}
async function remove(m) {
  if (!(await useConfirm().confirm(`Hapus mesin "${m.name}"?`))) return
  try {
    await $fetch(`/api/machines/${m.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    useToast().error(e.data?.statusMessage || 'Gagal menghapus')
  }
}
async function clearTuya() {
  form.value = { ...form.value, ...emptyTuya(), tuyaClear: true }
  tuyaEnabled.value = false
  probeMsg.value = 'Plug akan diputus saat disimpan.'
  scanResults.value = []
}

watch(tuyaEnabled, (on) => {
  if (on) {
    loadTuyaReady()
    return
  }
  probeMsg.value = ''
  scanResults.value = []
})

function hourlyElectricity(m) {
  return (m.powerWatt / 1000) * (settings.value?.electricityRatePerKwh ?? 1445)
}
function hourlyDepreciation(m) {
  return m.purchasePrice / Math.max(m.depreciationMonths, 1) / (settings.value?.machineUsageHoursPerMonth || 100)
}

function liveOf(m) {
  return live.value[m.id] || null
}
function displayWatt(m) {
  const l = liveOf(m)
  if (l?.powerWatt != null) return l.powerWatt
  if (m.tuyaLastPowerWatt != null) return m.tuyaLastPowerWatt
  return null
}

async function refreshPower(m) {
  if (!m.tuyaConfigured) return
  try {
    const row = await $fetch(`/api/machines/${m.id}/power`)
    live.value = { ...live.value, [m.id]: row }
  } catch (e) {
    live.value = {
      ...live.value,
      [m.id]: { error: e.data?.statusMessage || 'Gagal baca plug' }
    }
  }
}
async function refreshAllPower() {
  const list = (machines.value || []).filter((m) => m.tuyaConfigured)
  await Promise.all(list.map(refreshPower))
}

async function probePlug() {
  probing.value = true
  probeMsg.value = ''
  try {
    const body = {
      ip: form.value.tuyaIp,
      deviceId: form.value.tuyaDeviceId,
      localKey: form.value.tuyaLocalKey,
      version: form.value.tuyaVersion
    }
    if (!body.localKey && editing.value?.tuyaConfigured) {
      probeMsg.value = 'Isi Local Key lagi untuk uji (kunci tidak ditampilkan ulang).'
      return
    }
    const r = await $fetch('/api/tuya/probe', { method: 'POST', body })
    form.value.tuyaVersion = r.version || form.value.tuyaVersion
    probeMsg.value = `Terhubung (protokol ${r.version}). Daya ${r.powerWatt ?? '—'} W, ${r.voltage ?? '—'} V, colokan ${r.on ? 'ON' : 'OFF'}.`
    useToast().success('Plug Tuya merespons.')
  } catch (e) {
    probeMsg.value = e.data?.statusMessage || 'Gagal uji koneksi'
  } finally {
    probing.value = false
  }
}

async function scanLan() {
  scanning.value = true
  scanResults.value = []
  try {
    scanResults.value = await $fetch('/api/tuya/discover')
    if (!scanResults.value.length) probeMsg.value = 'Tidak ada siaran Tuya. Pastikan plug online di Wi‑Fi yang sama dengan komputer ini.'
  } catch (e) {
    probeMsg.value = e.data?.statusMessage || 'Gagal scan LAN'
  } finally {
    scanning.value = false
  }
}
function applyScan(d) {
  form.value.tuyaIp = d.ip
  form.value.tuyaDeviceId = d.id
  if (d.version) form.value.tuyaVersion = String(d.version)
}
async function loadTuyaReady() {
  try {
    tuyaReady.value = await $fetch('/api/tuya/ready')
  } catch {
    tuyaReady.value = null
  }
}
async function fillFromCloud() {
  fetchingCloud.value = true
  probeMsg.value = ''
  try {
    const list = await $fetch('/api/tuya/cloud-devices')
    if (!list?.length) {
      probeMsg.value =
        'Cloud tidak mengembalikan perangkat. Cek TUYA_API_REGION (in/eu/us) dan IoT Core. Daftar kosong biasanya karena akun Smart Life belum terlihat project — QR No access tidak wajib jika Device ID dari scan cocok nanti, tapi local key tetap dari cloud.'
      return
    }
    const id = form.value.tuyaDeviceId
    const match = id ? list.find((d) => d.id === id) : list[0]
    if (!match?.localKey) {
      probeMsg.value = `Cloud melihat ${list.length} perangkat, tapi local key kosong. Pilih Device ID dari scan lalu coba lagi.`
      return
    }
    form.value.tuyaDeviceId = match.id
    form.value.tuyaLocalKey = match.localKey
    if (match.ip && !form.value.tuyaIp) form.value.tuyaIp = match.ip
    probeMsg.value = `Local key diisi dari cloud: ${match.name || match.id}`
    useToast().success('Local key dari TinyTuya Cloud.')
  } catch (e) {
    probeMsg.value = e.data?.statusMessage || 'Gagal ambil dari Tuya Cloud'
  } finally {
    fetchingCloud.value = false
  }
}

let powerTimer
onMounted(() => {
  refreshAllPower()
  powerTimer = setInterval(refreshAllPower, 15000)
})
onUnmounted(() => {
  if (powerTimer) clearInterval(powerTimer)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-bold">Mesin</h1>
      <div class="flex gap-2">
        <button class="btn-secondary" title="Refresh daya plug" @click="refreshAllPower">
          <ArrowPathIcon class="w-4 h-4" />
        </button>
        <button v-if="isAdmin" class="btn-primary" @click="openAdd">
          <PlusIcon class="w-4 h-4" /><span class="hidden sm:inline">Tambah Mesin</span><span class="sm:hidden">Tambah</span>
        </button>
      </div>
    </div>

    <p class="text-xs text-ink-500">
      Biaya per jam dihitung dari tarif listrik {{ formatIDR(settings?.electricityRatePerKwh) }}/kWh
      dan asumsi pemakaian {{ settings?.machineUsageHoursPerMonth }} jam/bulan (ubah di Pengaturan).
      Daya live dari smart plug Tuya (jika dikaitkan) tidak otomatis mengganti angka HPP.
    </p>

    <div class="relative w-full md:max-w-xs">
      <MagnifyingGlassIcon class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
      <input
        v-model="search"
        class="input pl-9 w-full"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder="Cari nama mesin…"
      />
    </div>

    <!-- Kartu (mobile) -->
    <div class="md:hidden space-y-2">
      <div v-for="m in paged" :key="m.id" class="panel p-3 space-y-3">
        <div class="flex gap-3">
          <div class="w-14 h-14 rounded border border-ink-200 bg-ink-50 overflow-hidden shrink-0 flex items-center justify-center">
            <img v-if="m.imageKey" :src="`/api/machines/${m.id}/image`" alt="" class="w-full h-full object-cover" />
            <PhotoIcon v-else class="w-5 h-5 text-ink-300" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-medium break-words leading-snug">{{ m.name }}</div>
                <p v-if="m.notes" class="text-xs text-ink-400 mt-0.5 line-clamp-2">{{ m.notes }}</p>
              </div>
              <span
                v-if="m.tuyaConfigured"
                class="badge shrink-0 bg-teal-500/10 text-teal-700"
              >Plug</span>
            </div>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-2 text-sm">
          <div class="rounded-panel bg-ink-50 px-2.5 py-2">
            <dt class="text-[10px] uppercase tracking-wide text-ink-500">Daya HPP</dt>
            <dd class="font-mono font-medium mt-0.5">{{ m.powerWatt }} W</dd>
          </div>
          <div class="rounded-panel bg-ink-50 px-2.5 py-2">
            <dt class="text-[10px] uppercase tracking-wide text-ink-500">Live</dt>
            <dd class="font-mono font-medium mt-0.5">
              <span v-if="m.tuyaConfigured && displayWatt(m) != null" class="inline-flex items-center gap-0.5 text-teal-700">
                <BoltIcon class="w-3.5 h-3.5" />{{ displayWatt(m) }} W
              </span>
              <span v-else-if="m.tuyaConfigured && liveOf(m)?.error" class="text-xs text-red-600 font-sans">error</span>
              <span v-else-if="m.tuyaConfigured" class="text-ink-400">…</span>
              <span v-else class="text-ink-400">—</span>
            </dd>
          </div>
          <div class="rounded-panel bg-ink-50 px-2.5 py-2">
            <dt class="text-[10px] uppercase tracking-wide text-ink-500">Harga beli</dt>
            <dd class="font-mono font-medium mt-0.5">{{ formatIDR(m.purchasePrice) }}</dd>
          </div>
          <div class="rounded-panel bg-ink-50 px-2.5 py-2">
            <dt class="text-[10px] uppercase tracking-wide text-ink-500">Listrik / jam</dt>
            <dd class="font-mono font-medium mt-0.5">{{ formatIDR(hourlyElectricity(m)) }}</dd>
          </div>
        </dl>

        <div v-if="isAdmin" class="flex flex-wrap gap-1.5 border-t border-ink-100 pt-2">
          <button class="btn-secondary !py-1 !px-2 text-xs" @click="openEdit(m)">
            <PencilSquareIcon class="w-3.5 h-3.5" />Edit
          </button>
          <button class="btn-danger !py-1 !px-2 text-xs" @click="remove(m)">
            <TrashIcon class="w-3.5 h-3.5" />Hapus
          </button>
        </div>
      </div>
      <p v-if="!total" class="panel p-6 text-center text-sm text-ink-500">
        {{ search ? 'Tidak ada mesin yang cocok.' : 'Belum ada mesin.' }}
      </p>
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
            <th class="w-14"></th>
            <th>Nama</th>
            <th class="text-right">Daya HPP</th>
            <th class="text-right">Live plug</th>
            <th class="text-right">Harga Beli</th>
            <th class="text-right">Listrik / jam</th>
            <th class="text-right">Depresiasi / jam</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in paged" :key="m.id">
            <td>
              <div class="w-10 h-10 rounded border border-ink-200 bg-ink-50 overflow-hidden flex items-center justify-center">
                <img v-if="m.imageKey" :src="`/api/machines/${m.id}/image`" alt="" class="w-full h-full object-cover" />
                <PhotoIcon v-else class="w-4 h-4 text-ink-300" />
              </div>
            </td>
            <td class="font-medium">
              <div class="flex items-center gap-2">
                <span>{{ m.name }}</span>
                <span v-if="m.tuyaConfigured" class="badge bg-teal-500/10 text-teal-700 text-[10px]">Plug</span>
              </div>
              <div v-if="m.notes" class="text-xs text-ink-400 font-normal mt-0.5">{{ m.notes }}</div>
            </td>
            <td class="num">{{ m.powerWatt }} W</td>
            <td class="num">
              <span v-if="m.tuyaConfigured && displayWatt(m) != null" class="inline-flex items-center justify-end gap-1 text-teal-700">
                <BoltIcon class="w-3.5 h-3.5" />{{ displayWatt(m) }} W
                <span class="text-xs text-ink-400">{{ liveOf(m)?.on === false ? 'off' : '' }}</span>
              </span>
              <span v-else-if="m.tuyaConfigured && liveOf(m)?.error" class="text-xs text-red-600">{{ liveOf(m).error }}</span>
              <span v-else-if="m.tuyaConfigured" class="text-ink-400">membaca…</span>
              <span v-else class="text-ink-400">—</span>
            </td>
            <td class="num">{{ formatIDR(m.purchasePrice) }}</td>
            <td class="num">{{ formatIDR(hourlyElectricity(m)) }}</td>
            <td class="num">{{ formatIDR(hourlyDepreciation(m)) }}</td>
            <td class="whitespace-nowrap text-right">
              <template v-if="isAdmin">
                <button class="btn-secondary !py-1 !px-2 text-xs" @click="openEdit(m)"><PencilSquareIcon class="w-3.5 h-3.5" />Edit</button>
                <button class="btn-danger !py-1 !px-2 text-xs ml-1" @click="remove(m)"><TrashIcon class="w-3.5 h-3.5" />Hapus</button>
              </template>
              <span v-else class="text-ink-300 text-xs">—</span>
            </td>
          </tr>
          <tr v-if="!total">
            <td colspan="8" class="text-center text-ink-500 py-6">
              {{ search ? 'Tidak ada mesin yang cocok.' : 'Belum ada mesin.' }}
            </td>
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

    <AppModal v-if="showForm" :title="editing ? 'Edit Mesin' : 'Tambah Mesin'" size="lg" @close="((showForm = false), refresh())">
      <form class="space-y-3" @submit.prevent="save">
        <div v-if="editing" class="flex gap-4 items-start">
          <ImageUploader
            :src="`/api/machines/${editing.id}/image`"
            :has-image="!!editing.imageKey"
            :upload-url="`/api/machines/${editing.id}/image`"
            @changed="refresh()"
          />
          <p class="text-xs text-ink-500 pt-1">
            Foto mesin membantu membedakan printer saat memilih di recipe.
          </p>
        </div>
        <div>
          <label class="label">Nama</label>
          <input v-model="form.name" class="input" required placeholder="Ender 3 V2" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label">Daya HPP (Watt)</label>
            <input v-model.number="form.powerWatt" type="number" min="0" class="input-num" required />
          </div>
          <div>
            <label class="label">Harga Beli</label>
            <div class="money-input">
              <span class="money-input__prefix">Rp</span>
              <input v-model.number="form.purchasePrice" type="number" min="0" class="input-num" required />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="min-w-0">
            <label class="label">Tanggal Beli</label>
            <input v-model="form.purchaseDate" type="date" class="input w-full min-w-0" />
          </div>
          <div class="min-w-0">
            <label class="label">Masa Depresiasi (bulan)</label>
            <input v-model.number="form.depreciationMonths" type="number" min="1" class="input-num" required />
          </div>
        </div>
        <div>
          <label class="label">Catatan</label>
          <input v-model="form.notes" class="input" placeholder="opsional" />
        </div>

        <label class="flex items-start gap-3 cursor-pointer select-none rounded-panel border border-ink-200 p-3">
          <input
            v-model="tuyaEnabled"
            type="checkbox"
            class="mt-1 h-4 w-4 shrink-0 rounded border-ink-300 text-accent-500 focus:ring-accent-400"
          />
          <span class="min-w-0">
            <span class="block text-sm font-medium text-ink-900">Aktifkan smart plug Tuya</span>
            <span class="block text-xs text-ink-500 mt-0.5">
              Hubungkan plug untuk baca daya live. Form detail hanya tampil jika diaktifkan.
            </span>
          </span>
        </label>

        <div v-if="tuyaEnabled" class="border border-ink-200 rounded-panel p-3 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="label !mb-0">Smart plug Tuya (TinyTuya)</div>
              <p class="text-xs text-ink-500 mt-0.5">
                Scan LAN untuk IP + Device ID. Local key lewat Cloud (Access ID di .env) atau tempel manual.
              </p>
            </div>
            <div class="flex gap-1">
              <button type="button" class="btn-secondary !py-1 text-xs" :disabled="scanning" @click="scanLan">
                {{ scanning ? 'Scan…' : 'Cari di Wi‑Fi' }}
              </button>
            </div>
          </div>
          <ul v-if="scanResults.length" class="text-xs border border-ink-100 rounded-panel divide-y max-h-32 overflow-y-auto">
            <li v-for="d in scanResults" :key="d.id" class="flex items-center gap-2 px-2 py-1.5">
              <span class="font-mono truncate flex-1">{{ d.ip }} · {{ d.id }} · v{{ d.version }}</span>
              <button type="button" class="btn-secondary !py-0.5 !px-2" @click="applyScan(d)">Pakai</button>
            </li>
          </ul>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="label">IP plug</label>
              <input v-model="form.tuyaIp" class="input font-mono" placeholder="192.168.1.50" />
            </div>
            <div>
              <label class="label">Protokol</label>
              <select v-model="form.tuyaVersion" class="input">
                <option value="auto">Auto (coba 3.4 → 3.3 → 3.5)</option>
                <option value="3.3">3.3</option>
                <option value="3.4">3.4</option>
                <option value="3.5">3.5</option>
                <option value="3.1">3.1</option>
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Device ID</label>
              <input v-model="form.tuyaDeviceId" class="input font-mono" placeholder="bfxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Local Key</label>
              <input
                v-model="form.tuyaLocalKey"
                class="input font-mono"
                type="password"
                autocomplete="off"
                :placeholder="editing?.tuyaConfigured ? 'Kosongkan jika tidak diubah' : '16 karakter dari Tuya IoT'"
              />
            </div>
          </div>
          <p class="text-xs text-ink-500">
            Baca daya memakai TinyTuya (Python), protokol 3.3–3.5. Isi
            <code class="font-mono">TUYA_API_KEY</code> /
            <code class="font-mono">TUYA_API_SECRET</code> di <code class="font-mono">.env</code>
            (Access ID &amp; Secret project IoT, tanpa scan QR). Region default
            <code class="font-mono">in</code> — ganti <code class="font-mono">eu</code> atau
            <code class="font-mono">us</code> jika daftar cloud kosong. Restart
            <code class="font-mono">npm run dev</code> setelah mengubah .env.
          </p>
          <p v-if="tuyaReady && !tuyaReady.ok" class="text-xs text-red-600">{{ tuyaReady.error }}</p>
          <p v-else-if="tuyaReady?.ok" class="text-xs text-teal-700">
            TinyTuya {{ tuyaReady.tinytuya }}
            {{ tuyaReady.cloudConfigured ? '· cloud siap' : '· cloud belum diisi di .env' }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary !py-1 text-xs" :disabled="probing" @click="probePlug">
              {{ probing ? 'Menguji…' : 'Uji koneksi' }}
            </button>
            <button type="button" class="btn-secondary !py-1 text-xs" :disabled="fetchingCloud" @click="fillFromCloud">
              {{ fetchingCloud ? 'Cloud…' : 'Ambil local key dari cloud' }}
            </button>
            <button v-if="editing?.tuyaConfigured" type="button" class="btn-danger !py-1 text-xs" @click="clearTuya">
              Putuskan plug
            </button>
          </div>
          <p v-if="probeMsg" class="text-xs" :class="probeMsg.startsWith('Terhubung') ? 'text-teal-700' : 'text-ink-600'">{{ probeMsg }}</p>
        </div>

        <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="((showForm = false), refresh())">
            <XMarkIcon class="w-4 h-4" />{{ editing ? 'Tutup' : 'Batal' }}
          </button>
          <button type="submit" class="btn-primary"><CheckIcon class="w-4 h-4" />Simpan</button>
        </div>
      </form>
    </AppModal>
  </div>
</template>
