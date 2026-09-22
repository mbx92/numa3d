<script setup>
import { ArrowUpTrayIcon, ScissorsIcon } from '@heroicons/vue/24/outline'

const props = defineProps({
  products: { type: Array, default: () => [] },
  materials: { type: Array, default: () => [] },
  machines: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['queued'])

const productId = ref('')
const machineId = ref('')
const failureRatePercent = ref(5)
const laborMinutes = ref(0)
const laborRatePerHour = ref(0)
const file = shallowRef(null)
const fileInput = ref(null)
const existingId = ref('')
const productFiles = ref([])
const inspection = shallowRef(null)
const selections = ref([])
const plateOptions = ref([])
const selectedPlates = ref([])
const draftPlates = ref([])
const platePickerOpen = ref(false)
const busy = ref(false)
const error = ref('')

const available = computed(() => props.materials.filter((material) =>
  material.type === 'filament' && material.unit === 'gram' && (!material.filamentTypeName || /^PLA/i.test(material.filamentTypeName))
))
const modelFiles = computed(() => productFiles.value.filter((item) => /\.(stl|3mf)$/i.test(item.filename)))
const selectedProduct = computed(() => props.products.find((product) => Number(product.id) === Number(productId.value)) || null)
const mappingReady = computed(() => inspection.value && inspection.value.colors?.length && !inspection.value.emptyPlates?.length &&
  selections.value.length === inspection.value.colors.length && selections.value.every((id) => available.value.some((material) => Number(material.id) === Number(id) && Number(material.stockQuantity) > 0)))

watch(() => props.products, (rows) => {
  if (!productId.value && rows?.length) productId.value = rows[0].id
}, { immediate: true })
watch(() => props.machines, (rows) => {
  if (!machineId.value && rows?.length) machineId.value = rows[0].id
}, { immediate: true })
watch(productId, async (id) => {
  resetModel()
  productFiles.value = id ? await $fetch(`/api/products/${id}/files`).catch(() => []) : []
}, { immediate: true })

function resetModel() {
  file.value = null
  existingId.value = ''
  inspection.value = null
  selections.value = []
  plateOptions.value = []
  selectedPlates.value = []
  draftPlates.value = []
  platePickerOpen.value = false
  error.value = ''
}

function selectMaterial(index, material) {
  selections.value[index] = material.id
}

async function inspectFile(selected) {
  if (!selected) return
  busy.value = true
  error.value = ''
  try {
    const body = new FormData()
    body.append('file', selected)
    if (selectedPlates.value.length) body.append('selectedPlates', JSON.stringify(selectedPlates.value))
    const result = await $fetch('/api/slicer/inspect', { method: 'POST', body, retry: 0 })
    inspection.value = result
    plateOptions.value = result.plates || []
    selectedPlates.value = result.format === '3mf' ? (result.selectedPlates || [result.selectedPlate]).filter(Boolean) : []
    draftPlates.value = [...selectedPlates.value]
    selections.value = result.colors.map((color) => {
      const match = available.value.find((material) => Number(material.stockQuantity) > 0 && String(material.color || '').toLowerCase() === color.toLowerCase())
      return match?.id || ''
    })
  } catch (cause) {
    error.value = cause.data?.statusMessage || cause.message || 'File tidak dapat diperiksa'
  } finally {
    busy.value = false
  }
}

async function pickFile(event) {
  const selected = event.target.files?.[0]
  event.target.value = ''
  if (!selected) return
  resetModel()
  if (!/\.(stl|3mf)$/i.test(selected.name) || !selected.size || selected.size > 40 * 1024 * 1024) {
    error.value = 'Pilih file STL atau 3MF, maksimal 40 MB.'
    return
  }
  file.value = selected
  await inspectFile(selected)
}

async function selectExisting() {
  inspection.value = null
  selections.value = []
  selectedPlates.value = []
  plateOptions.value = []
  if (!existingId.value) return
  busy.value = true
  try {
    const source = modelFiles.value.find((item) => Number(item.id) === Number(existingId.value))
    const blob = await $fetch(`/api/files/${source.id}`, { responseType: 'blob', retry: 0 })
    file.value = new File([blob], source.filename, { type: /\.3mf$/i.test(source.filename) ? 'model/3mf' : 'model/stl' })
  } catch (cause) {
    error.value = cause.data?.statusMessage || cause.message || 'File produk tidak dapat dibuka'
    busy.value = false
    return
  }
  busy.value = false
  await inspectFile(file.value)
}

function togglePlate(id) {
  if (draftPlates.value.includes(id)) draftPlates.value = draftPlates.value.filter((value) => value !== id)
  else if (draftPlates.value.length < 16) draftPlates.value.push(id)
}

async function applyPlates() {
  if (!draftPlates.value.length) return
  selectedPlates.value = plateOptions.value.map((plate) => plate.id).filter((id) => draftPlates.value.includes(id))
  platePickerOpen.value = false
  await inspectFile(file.value)
}

async function enqueue() {
  if (busy.value || props.disabled || !productId.value || !file.value || !mappingReady.value) return
  busy.value = true
  error.value = ''
  try {
    const body = new FormData()
    body.append('file', file.value)
    body.append('tool', 'product')
    body.append('productId', String(productId.value))
    body.append('materialIds', JSON.stringify(selections.value.map(Number)))
    body.append('failureRatePercent', String(failureRatePercent.value || 0))
    body.append('laborMinutes', String(laborMinutes.value || 0))
    body.append('laborRatePerHour', String(laborRatePerHour.value || 0))
    if (machineId.value) body.append('machineId', String(machineId.value))
    if (inspection.value.format === '3mf') body.append('selectedPlates', JSON.stringify(selectedPlates.value))
    const job = await $fetch('/api/slicer/jobs', { method: 'POST', body, retry: 0 })
    emit('queued', job)
    resetModel()
  } catch (cause) {
    error.value = cause.data?.statusMessage || cause.message || 'Gagal menambahkan antrean slicing'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="panel overflow-hidden">
    <div class="panel-header"><span class="panel-title">Slicing produk baru</span></div>
    <div class="p-3 sm:p-4 space-y-4">
      <div>
        <label class="label">Produk tujuan</label>
        <ProductPicker v-model="productId" :products="products" :disabled="busy || disabled" />
        <p class="mt-1 text-xs text-ink-500">Hasil Orca akan mengganti filament dan proses recipe {{ selectedProduct?.name || 'produk terpilih' }}. Material komponen dan packaging tetap dipertahankan.</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="label">File dari perangkat</label>
          <button type="button" class="btn-secondary w-full justify-center" :disabled="busy || disabled" @click="fileInput.click()">
            <ArrowUpTrayIcon class="w-4 h-4" />Pilih STL / 3MF
          </button>
          <input ref="fileInput" type="file" accept=".stl,.3mf" class="hidden" @change="pickFile" />
        </div>
        <div>
          <label class="label">Atau file produk</label>
          <select v-model="existingId" class="input" :disabled="busy || disabled || !modelFiles.length" @change="selectExisting">
            <option value="">{{ modelFiles.length ? 'Pilih file produk…' : 'Belum ada STL / 3MF' }}</option>
            <option v-for="item in modelFiles" :key="item.id" :value="item.id">{{ item.filename }}</option>
          </select>
        </div>
      </div>
      <p v-if="file" class="text-xs font-mono text-ink-500 break-all">{{ file.name }} · {{ (file.size / 1024 / 1024).toFixed(2) }} MB</p>

      <div v-if="plateOptions.length > 1" class="space-y-2">
        <label class="label">Plate yang dihitung</label>
        <button type="button" class="input text-left" @click="platePickerOpen = !platePickerOpen">{{ selectedPlates.length }} plate dipilih: {{ selectedPlates.join(', ') }}</button>
        <div v-if="platePickerOpen" class="rounded-lg border border-ink-200 p-2 space-y-2">
          <label v-for="plate in plateOptions" :key="plate.id" class="flex items-center gap-2 p-1 text-sm">
            <input type="checkbox" :checked="draftPlates.includes(plate.id)" @change="togglePlate(plate.id)" />
            Plate {{ plate.id }}{{ plate.name ? ` · ${plate.name}` : '' }}
          </label>
          <button type="button" class="btn-secondary" :disabled="!draftPlates.length" @click="applyPlates">Terapkan plate</button>
        </div>
      </div>

      <div v-if="inspection" class="rounded-lg border border-ink-200 bg-ink-50 p-3 space-y-3">
        <div>
          <p class="text-sm font-semibold">Material recipe</p>
          <p class="text-xs text-ink-500">Pilih material inventori untuk setiap warna model melalui dialog material.</p>
        </div>
        <div v-for="(color, index) in inspection.colors" :key="`${color}-${index}`" class="flex items-center gap-2">
          <span class="w-8 h-8 rounded border border-black/10 shrink-0" :style="{ backgroundColor: color }" />
          <MaterialColorPicker
            class="flex-1"
            :material-id="selections[index] || null"
            :hex="color"
            :label="`Warna model ${color.toUpperCase()}`"
            material-type="filament"
            :materials="available"
            :disabled="busy || disabled"
            @select="selectMaterial(index, $event)"
          />
        </div>
        <p v-if="!mappingReady" class="text-xs text-amber-700">Pilih material yang masih tersedia untuk setiap warna.</p>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label class="label">Mesin</label>
          <select v-model="machineId" class="input"><option value="">—</option><option v-for="machine in machines" :key="machine.id" :value="machine.id">{{ machine.name }}</option></select>
        </div>
        <div><label class="label">Gagal (%)</label><input v-model.number="failureRatePercent" type="number" min="0" max="100" step="0.5" class="input-num" /></div>
        <div><label class="label">Kerja (menit)</label><input v-model.number="laborMinutes" type="number" min="0" class="input-num" /></div>
        <div><label class="label">Upah / jam</label><IdrInput v-model="laborRatePerHour" /></div>
      </div>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
      <button type="button" class="btn-primary" :disabled="busy || disabled || !productId || !file || !mappingReady" @click="enqueue">
        <ScissorsIcon class="w-4 h-4" />{{ busy ? 'Memeriksa…' : 'Tambahkan ke antrean Orca' }}
      </button>
    </div>

  </div>
</template>
