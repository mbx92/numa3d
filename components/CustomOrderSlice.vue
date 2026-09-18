<script setup>
import { parseMaterialColor } from '~/utils/materialColor.js'
import { stockShortages } from '#shared/utils/customOrderMaterials.js'
import { ArrowUpTrayIcon, ScissorsIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  materials: { type: Array, default: () => [] },
  quantity: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false },
  files: { type: Array, default: () => [] }
})
const emit = defineEmits(['sliced', 'ready', 'busy'])
const file = shallowRef(null)
const job = shallowRef(null)
const error = ref('')
const busy = ref(false)
const existingId = ref('')
const input = ref(null)
const inspection = shallowRef(null)
const selections = ref([])
const available = computed(() => props.materials.filter((m) => m.type === 'filament' && m.unit === 'gram' && (!m.filamentTypeName || /^PLA/i.test(m.filamentTypeName))))
const mappingReady = computed(() => inspection.value && selections.value.length === inspection.value.colors.length && selections.value.every((id) => available.value.some((m) => Number(m.id) === Number(id) && Number(m.stockQuantity) > 0)) && new Set(selections.value.map(Number)).size <= inspection.value.maxColors)
const usage = computed(() => job.value?.status === 'completed' ? job.value.result.filamentGrams.map((grams, i) => ({ materialId: job.value.result.materialIds[i], quantityUsed: grams / job.value.result.filamentGrams.reduce((a, b) => a + b, 0) * job.value.result.totalGrams })) : [])
const shortages = computed(() => stockShortages(usage.value, available.value, props.quantity))
watch([job, shortages], () => { if (job.value?.status === 'completed') emit('ready', !shortages.value.length) })
async function inspectFile() {
  const current = version
  inspection.value = null
  selections.value = []
  busy.value = true
  emit('busy', true)
  try {
    if (!file.value && existingId.value) {
      const source = modelFiles.value.find((item) => item.id === Number(existingId.value))
      const blob = await $fetch(`/api/custom-order-files/${source.id}`, { responseType: 'blob', retry: 0 })
      if (current !== version) return
      file.value = new File([blob], source.filename)
    }
    const body = new FormData()
    body.append('file', file.value)
    const result = await $fetch('/api/slicer/inspect', { method: 'POST', body, retry: 0 })
    if (current !== version) return
    inspection.value = result
    selections.value = result.colors.map((color) => {
      const match = available.value.find((m) => Number(m.stockQuantity) > 0 && (!result.hasDefinedColors || parseMaterialColor(m.color, null) === color.toLowerCase()))
      return match?.id || ''
    })
  } catch (e) { if (current === version) error.value = e.data?.statusMessage || e.message }
  finally { if (current === version) { busy.value = false; emit('busy', false) } }
}

let version = 0
onUnmounted(() => { version++ })
const modelFiles = computed(() => props.files.filter((item) => /\.(stl|3mf)$/i.test(item.filename)))

function reset() {
  version++
  job.value = null
  error.value = ''
  emit('sliced', null)
  emit('ready', false)
}

function pick(event) {
  const selected = event.target.files?.[0]
  if (!selected) return
  reset()
  file.value = null
  inspection.value = null
  selections.value = []
  existingId.value = ''
  if (!/\.(stl|3mf)$/i.test(selected.name) || selected.size > 40 * 1024 * 1024 || !selected.size) {
    error.value = 'Pilih file STL atau 3MF, maksimal 40 MB.'
  } else { file.value = selected; inspectFile() }
  event.target.value = ''
}

function selectExisting() {
  reset()
  file.value = null
  inspection.value = null
  if (existingId.value) inspectFile()
}

async function slice() {
  if (busy.value || props.disabled || !mappingReady.value) return
  reset()
  const current = version
  busy.value = true
  emit('busy', true)
  try {
    let selected = file.value
    if (!selected) {
      const source = modelFiles.value.find((item) => item.id === Number(existingId.value))
      const blob = await $fetch(`/api/custom-order-files/${source.id}`, { responseType: 'blob', retry: 0 })
      selected = new File([blob], source.filename, { type: /\.3mf$/i.test(source.filename) ? 'model/3mf' : 'model/stl' })
    }
    const body = new FormData()
    body.append('file', selected)
    body.append('tool', 'custom-order')
    body.append('materialIds', JSON.stringify(selections.value.map(Number)))
    let active = await $fetch('/api/slicer/jobs', { method: 'POST', body, retry: 0 })
    while (current === version && ['queued', 'processing'].includes(active.status)) {
      job.value = active
      active = await $fetch(`/api/slicer/jobs/${active.id}`, { retry: 0 })
      if (current !== version) return
      job.value = active
      if (['queued', 'processing'].includes(active.status)) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    if (current !== version) return
    job.value = active
    if (active.status !== 'completed' || !active.result) throw new Error(active.error || 'Slicing gagal atau dibatalkan')
    emit('sliced', active)
    emit('ready', !shortages.value.length)
  } catch (e) {
    if (current === version) error.value = e.data?.statusMessage || e.message || 'Slicing gagal'
  } finally {
    busy.value = false
    if (current === version) emit('busy', false)
  }
}
</script>

<template>
  <div class="rounded-lg border border-ink-200 bg-ink-50 p-3 space-y-2">
    <div class="flex items-center gap-1">
      <p class="text-sm font-medium">1. Unggah STL / 3MF dan slice</p>
      <InfoTooltip label="Informasi file dan profil slicing">
        Satu file = satu unit pesanan. STL satu warna; warna dan painting 3MF mengikuti file, maksimal empat material inventori sekaligus. Profil PLA Kobra X 0,4 mm / layer 0,16 mm. STL dibaca dalam mm; satuan dan orientasi 3MF mengikuti model. Pilih pengganti secara eksplisit jika warna file tidak tersedia. Profil cetak memakai profil aplikasi.
      </InfoTooltip>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn-secondary" :disabled="disabled || busy" @click="input.click()">
        <ArrowUpTrayIcon class="w-4 h-4" />Pilih STL / 3MF
      </button>
      <input ref="input" type="file" accept=".stl,.3mf" class="hidden" :disabled="disabled || busy" @change="pick" />
      <button type="button" class="btn-primary" :disabled="disabled || busy || !mappingReady" @click="slice">
        <ScissorsIcon class="w-4 h-4" />{{ busy ? 'Memproses…' : 'Slice dengan Orca' }}
      </button>
    </div>
    <select v-if="modelFiles.length" v-model="existingId" class="input" :disabled="disabled || busy" @change="selectExisting">
      <option value="">Atau pilih STL / 3MF yang sudah diunggah</option>
      <option v-for="item in modelFiles" :key="item.id" :value="item.id">{{ item.filename }}</option>
    </select>
    <div v-if="inspection" class="space-y-2">
      <div v-for="(color, i) in inspection.colors" :key="i" class="flex items-center gap-2">
        <span class="w-5 h-5 rounded border shrink-0" :style="{ backgroundColor: color }" />
        <span class="text-xs w-24 shrink-0">{{ inspection.hasDefinedColors ? color : 'Warna cetak' }}</span>
        <select v-model="selections[i]" class="input" :disabled="disabled || busy" @change="reset">
          <option value="" disabled>Pilih material / pengganti</option>
          <option v-for="m in available" :key="m.id" :value="m.id" :disabled="Number(m.stockQuantity) <= 0">{{ m.name }} · stok {{ Number(m.stockQuantity).toFixed(1) }} g</option>
        </select>
      </div>
      <p v-if="!mappingReady" class="text-xs text-amber-700">Pilih material tersedia untuk setiap warna, maksimal {{ inspection.maxColors }} material berbeda. Beberapa warna boleh memakai material pengganti yang sama.</p>
    </div>
    <div v-if="usage.length" class="text-xs space-y-1">
      <p v-for="line in usage" :key="line.materialId">{{ available.find(m => Number(m.id) === Number(line.materialId))?.name }} · {{ line.quantityUsed.toFixed(2) }} g / unit · {{ (line.quantityUsed * quantity).toFixed(2) }} g untuk pesanan</p>
      <p v-for="s in shortages" :key="s.materialId" class="text-red-600" role="alert">Stok {{ s.name }} kurang: perlu {{ s.needed.toFixed(2) }} g, tersedia {{ s.stock.toFixed(2) }} g.</p>
    </div>
    <p v-if="file" class="text-xs font-mono break-all">{{ file.name }} · {{ (file.size / 1024 / 1024).toFixed(2) }} MB</p>
    <p v-if="job" class="text-xs text-ink-500">Job #{{ job.id }} · {{ job.stage }}</p>
    <p v-if="job?.status === 'completed'" class="text-sm text-teal-700">
      {{ job.result.totalGrams.toFixed(2) }} g · {{ Math.floor(job.result.printTimeSeconds / 60) }} menit {{ Math.round(job.result.printTimeSeconds % 60) }} detik / unit
    </p>
    <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
  </div>
</template>
