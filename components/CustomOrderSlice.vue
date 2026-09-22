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
const plateOptions = ref([])
const selectedPlates = ref([])
const draftPlates = ref([])
const platePickerOpen = ref(false)
const available = computed(() => props.materials.filter((m) => m.type === 'filament' && m.unit === 'gram' && (!m.filamentTypeName || /^PLA/i.test(m.filamentTypeName))))
const plateLabel = computed(() => selectedPlates.value.length ? `${selectedPlates.value.length} plate dipilih: ${selectedPlates.value.join(', ')}` : 'Pilih plate')
const mappingReady = computed(() => inspection.value && inspection.value.colors.length > 0 && !inspection.value.emptyPlates?.length && (inspection.value.format !== '3mf' || JSON.stringify(inspection.value.selectedPlates || [inspection.value.selectedPlate]) === JSON.stringify(selectedPlates.value)) && selections.value.length === inspection.value.colors.length && selections.value.every((id) => available.value.some((m) => Number(m.id) === Number(id) && Number(m.stockQuantity) > 0)) && new Set(selections.value.map(Number)).size <= inspection.value.maxColors)
const usage = computed(() => job.value?.status === 'completed' ? job.value.result.filamentGrams.map((grams, i) => ({ materialId: job.value.result.materialIds[i], quantityUsed: grams / job.value.result.filamentGrams.reduce((a, b) => a + b, 0) * job.value.result.totalGrams })) : [])
const shortages = computed(() => stockShortages(usage.value, available.value, props.quantity))
watch([job, shortages], () => { if (job.value?.status === 'completed') emit('ready', !shortages.value.length) })
const selectedMaterial = (index) => available.value.find((material) => Number(material.id) === Number(selections.value[index])) || null
const selectedMaterialColor = (index, fallback) => parseMaterialColor(selectedMaterial(index)?.color, fallback)
function pickMaterial(index, material) {
  if (Number(material.stockQuantity) <= 0) return
  selections.value[index] = material.id
  reset()
}
async function inspectFile() {
  const current = version
  const previousMaterials = new Map(inspection.value?.colors.map((color, index) => [color, selections.value[index]]) || [])
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
    if (selectedPlates.value.length) body.append('selectedPlates', JSON.stringify(selectedPlates.value))
    const result = await $fetch('/api/slicer/inspect', { method: 'POST', body, retry: 0 })
    if (current !== version) return
    inspection.value = result
    plateOptions.value = result.plates || []
    selectedPlates.value = result.format === '3mf' ? (result.selectedPlates || [result.selectedPlate]) : []
    draftPlates.value = [...selectedPlates.value]
    selections.value = result.colors.map((color) => {
      const previous = previousMaterials.get(color)
      if (available.value.some((m) => Number(m.id) === Number(previous) && Number(m.stockQuantity) > 0)) return previous
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
  plateOptions.value = []
  selectedPlates.value = []
  draftPlates.value = []
  platePickerOpen.value = false
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
  plateOptions.value = []
  selectedPlates.value = []
  draftPlates.value = []
  platePickerOpen.value = false
  if (existingId.value) inspectFile()
}

function toggleDraftPlate(id) {
  if (draftPlates.value.includes(id)) draftPlates.value = draftPlates.value.filter((plate) => plate !== id)
  else if (draftPlates.value.length < 16) draftPlates.value = [...draftPlates.value, id]
}

function applyPlates() {
  if (!draftPlates.value.length) {
    error.value = 'Pilih minimal satu plate.'
    return
  }
  reset()
  selectedPlates.value = plateOptions.value.map((plate) => plate.id).filter((id) => draftPlates.value.includes(id))
  platePickerOpen.value = false
  inspectFile()
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
    if (inspection.value.format === '3mf') body.append('selectedPlates', JSON.stringify(selectedPlates.value))
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
        STL atau seluruh plate 3MF yang dipilih dihitung sebagai satu unit pesanan. Setiap plate di-slice terpisah, lalu gram dan waktu dijumlahkan. STL satu warna; warna dan painting 3MF mengikuti plate pilihan, maksimal empat material inventori sekaligus. Profil PLA Kobra X 0,4 mm / layer 0,16 mm. STL dibaca dalam mm; satuan dan orientasi 3MF mengikuti model. Profil cetak memakai profil aplikasi.
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
    <div v-if="plateOptions.length > 1" class="space-y-1">
      <p class="block text-xs font-semibold">Plate yang dihitung</p>
      <button type="button" class="input w-full text-left" :aria-expanded="platePickerOpen" aria-controls="custom-order-plates" :disabled="disabled || busy" @click="platePickerOpen = !platePickerOpen">{{ plateLabel }}</button>
      <div v-if="platePickerOpen" id="custom-order-plates" class="rounded-lg border border-ink-200 bg-white p-2 space-y-2">
        <div class="max-h-48 overflow-y-auto space-y-1">
          <label v-for="plate in plateOptions" :key="plate.id" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-50 cursor-pointer">
            <input type="checkbox" :checked="draftPlates.includes(plate.id)" :disabled="disabled || busy || (!draftPlates.includes(plate.id) && draftPlates.length >= 16)" @change="toggleDraftPlate(plate.id)" />
            <span>Plate {{ plate.id }}{{ plate.name ? ` · ${plate.name}` : '' }}</span>
          </label>
        </div>
        <div class="flex items-center justify-between gap-2 border-t border-ink-100 pt-2">
          <p class="text-[11px] text-ink-400">{{ draftPlates.length }}/16 plate dipilih</p>
          <button type="button" class="btn-secondary" :disabled="disabled || busy || !draftPlates.length" @click="applyPlates">Terapkan plate</button>
        </div>
      </div>
    </div>
    <div v-if="inspection" class="space-y-2">
      <p v-if="inspection.empty || inspection.emptyPlates?.length" class="text-xs text-amber-700">Plate {{ inspection.emptyPlates?.join(', ') || inspection.selectedPlate }} kosong. Hapus dari pilihan sebelum slicing.</p>
      <div class="rounded-lg border border-ink-200 p-3 space-y-2">
        <div class="flex items-center gap-1">
          <p class="text-sm font-semibold">Material untuk slicing</p>
          <InfoTooltip label="Informasi material slicing">Setiap warna model dipetakan ke stok filament PLA. Warna material terpilih dipakai saat slicing; slicing tidak mengurangi stok.</InfoTooltip>
        </div>
        <div v-for="(color, i) in inspection.colors" :key="`${color}-${i}`" class="flex items-center gap-2">
          <span class="w-5 h-5 rounded border border-black/10 shrink-0" :title="`Warna model ${color.toUpperCase()}`" :style="{ backgroundColor: color }" />
          <div class="min-w-0 flex-1">
            <MaterialColorPicker :material-id="selections[i] || null" :hex="color" :label="`Model ${color.toUpperCase()}`" material-type="filament" :materials="available" :disabled="disabled || busy" @select="pickMaterial(i, $event)" />
            <p v-if="selectedMaterial(i)" class="mt-1 text-[11px] text-ink-400 font-mono">Model {{ color.toUpperCase() }} → filament {{ selectedMaterialColor(i, color).toUpperCase() }}</p>
          </div>
        </div>
        <p v-if="!available.length" class="text-xs text-amber-700">Belum ada filament PLA dalam satuan gram di menu Material.</p>
        <p v-else-if="!mappingReady && inspection.colors.length" class="text-xs text-amber-700">Pilih material tersedia untuk setiap warna, maksimal {{ inspection.maxColors }} material berbeda.</p>
        <p class="text-[11px] text-ink-400">Beberapa warna boleh dipetakan ke material yang sama.</p>
      </div>
    </div>
    <div v-if="usage.length" class="text-xs space-y-1">
      <p v-for="line in usage" :key="line.materialId">{{ available.find(m => Number(m.id) === Number(line.materialId))?.name }} · {{ line.quantityUsed.toFixed(2) }} g / unit · {{ (line.quantityUsed * quantity).toFixed(2) }} g untuk pesanan</p>
      <p v-for="s in shortages" :key="s.materialId" class="text-red-600" role="alert">Stok {{ s.name }} kurang: perlu {{ s.needed.toFixed(2) }} g, tersedia {{ s.stock.toFixed(2) }} g.</p>
    </div>
    <p v-if="file" class="text-xs font-mono break-all">{{ file.name }} · {{ (file.size / 1024 / 1024).toFixed(2) }} MB</p>
    <p v-if="job" class="text-xs text-ink-500">Job #{{ job.id }} · {{ job.stage }}</p>
    <p v-if="job?.status === 'completed'" class="text-sm text-teal-700">
      <template v-if="job.result.selectedPlates?.length">{{ job.result.selectedPlates.length }} plate · </template>{{ job.result.totalGrams.toFixed(2) }} g · {{ Math.floor(job.result.printTimeSeconds / 60) }} menit {{ Math.round(job.result.printTimeSeconds % 60) }} detik / unit
    </p>
    <div v-if="job?.status === 'completed' && job.result.plates?.length" class="text-xs text-ink-500 space-y-0.5">
      <p v-for="plate in job.result.plates" :key="plate.id">Plate {{ plate.id }}{{ plate.name ? ` · ${plate.name}` : '' }}: {{ plate.totalGrams.toFixed(2) }} g · {{ Math.ceil(plate.printTimeSeconds / 60) }} menit</p>
    </div>
    <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
  </div>
</template>
