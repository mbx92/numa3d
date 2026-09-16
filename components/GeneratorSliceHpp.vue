<script setup>
import { CheckIcon } from '@heroicons/vue/24/outline'
import { computeHpp } from '~/utils/hpp.js'
import { mergeGeneratorRecipe, printMinutesFromSlice, slicerToEstimateLines } from '~/utils/meshHppEstimate.js'

const props = defineProps({
  result: { type: Object, default: null },
  tool: { type: String, required: true },
  printOptions: { type: Object, default: () => ({}) },
  colorFields: { type: Array, default: () => [] },
  materialIds: { type: Object, default: () => ({}) },
  colors: { type: Object, default: () => ({}) },
  colorMode: { type: String, default: 'material' },
  switchMaterialId: { type: [Number, String], default: null }
})

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()
const { data: products } = await useFetch('/api/products', { server: false, lazy: true })
const { data: materials } = await useFetch('/api/materials', { server: false, lazy: true })
const { data: machines } = await useFetch('/api/machines', { server: false, lazy: true })
const { data: settings } = await useFetch('/api/settings', { server: false, lazy: true })
const { data: slicerStatus } = await useFetch('/api/slicer/status', { server: false, lazy: true })

const productId = ref('')
const machineId = ref('')
const sliced = shallowRef(null)
const busy = ref(false)
const saving = ref(false)
const error = ref('')
let requestVersion = 0
watch(() => [props.result, props.printOptions.processPreset], () => {
  sliced.value = null
  error.value = ''
  requestVersion++
})

const duration = computed(() => {
  if (!sliced.value) return ''
  const total = Math.round(sliced.value.printTimeSeconds)
  return `${Math.floor(total / 60)} menit ${total % 60} detik`
})
const estimate = computed(() => sliced.value
  ? slicerToEstimateLines(sliced.value, {
    colorFields: props.colorFields,
    materialIds: props.materialIds,
    colors: props.colors,
    materials: materials.value || [],
    switchMaterialId: props.switchMaterialId
  })
  : { lines: [], skipped: [] })
const printMinutes = computed(() => printMinutesFromSlice(sliced.value))
const selectedProduct = computed(() =>
  (products.value || []).find((p) => Number(p.id) === Number(productId.value))
)
const hppPreview = computed(() => {
  if (!estimate.value.lines.length) return null
  const machine = (machines.value || []).find((m) => Number(m.id) === Number(machineId.value)) || null
  const recipes = estimate.value.lines.map((line, i) => ({
    materialId: line.materialId,
    quantityUsed: line.quantityUsed,
    printTimeMinutes: i === 0 ? printMinutes.value : 0,
    failureRatePercent: 5,
    laborMinutes: 0,
    laborRatePerHour: 0,
    material: line.material,
    machine: i === 0 ? machine : null
  }))
  return computeHpp(recipes, [], settings.value)
})

async function slice() {
  if (busy.value || !props.result) return
  busy.value = true
  error.value = ''
  sliced.value = null
  const version = ++requestVersion
  try {
    const model = props.result
    const exporter = model.getPlate3mfBlob || model.get3mfBlob
    if (!exporter) throw new Error('Model belum mendukung slicing')
    const options = { ...props.printOptions }
    const body = new FormData()
    body.append('file', await exporter.call(model, options), 'model.3mf')
    body.append('tool', props.tool)
    body.append('includeProfile', String(options.processPreset !== null))
    const response = await $fetch('/api/slicer/slice', { method: 'POST', body, timeout: 200000, retry: 0 })
    if (version === requestVersion) sliced.value = response
  } catch (e) {
    if (version === requestVersion) error.value = e.data?.statusMessage || e.message || 'Slicing gagal'
  } finally { busy.value = false }
}

async function applyRecipe() {
  if (saving.value || !props.result || !isAdmin.value || !productId.value || !estimate.value.lines.length) return
  saving.value = true
  try {
    const targetProductId = productId.value
    const model = props.result
    const slice = sliced.value
    const product = await $fetch(`/api/products/${targetProductId}`)
    if (!props.result || props.result !== model || sliced.value !== slice) throw new Error('Desain atau hasil slice berubah. Slice ulang sebelum mengisi recipe.')
    const body = mergeGeneratorRecipe({
      existingRecipes: product.recipes || [],
      existingPackaging: product.packaging || [],
      estimateLines: estimate.value.lines.map((line) => ({ ...line })),
      materials: materials.value || [],
      machineId: machineId.value || null,
      printTimeMinutes: printMinutesFromSlice(slice)
    })
    if (!body.recipes.length) throw new Error('Tidak ada baris recipe untuk disimpan')
    await $fetch(`/api/products/${targetProductId}/recipe`, { method: 'PUT', body })
    toast.success(`Recipe ${product.name}: ${formatNumber(slice.totalGrams, 2)} g · ${printMinutesFromSlice(slice)} menit.`)
  } catch (e) {
    toast.error(e.data?.statusMessage || e.message || 'Gagal mengisi recipe')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-2 pt-3 border-t border-ink-200">
    <h3 class="text-sm font-semibold">Estimasi Orca untuk recipe</h3>
    <p class="text-[10px] text-ink-400 leading-relaxed">
      Orca hanya menghitung gram filament dan waktu cetak. Angka itu diisi ke recipe produk; HPP memakai harga material dan mesin di katalog.
    </p>
    <p class="text-[10px]" :class="slicerStatus?.ready ? 'text-emerald-700' : 'text-amber-700'">
      {{ slicerStatus?.message || 'Memeriksa OrcaSlicer di server…' }}
    </p>
    <button type="button" class="btn-primary w-full text-sm" :disabled="busy || !result || slicerStatus?.ready === false" @click="slice">
      {{ busy ? 'OrcaSlicer sedang memproses…' : 'Slice gram & waktu' }}
    </button>
    <p v-if="!result" class="text-xs text-ink-500">Generate model dulu sebelum slicing.</p>
    <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
    <div v-if="sliced" class="space-y-2 text-xs">
      <p class="font-medium">{{ formatNumber(sliced.totalGrams, 2) }} g filament · {{ duration }}</p>
      <ul class="space-y-1 text-ink-500">
        <li v-for="(grams, index) in sliced.filamentGrams" :key="index" class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full border border-ink-200" :style="{ backgroundColor: sliced.colors[index] }" />
          Warna {{ index + 1 }}: {{ formatNumber(grams, 2) }} g
        </li>
      </ul>
      <p class="text-[10px] text-ink-500 leading-relaxed">
        {{ sliced.profile }}
        <template v-if="sliced.primeTower"> · termasuk prime tower</template>
        <template v-if="sliced.filamentChanges"> · {{ sliced.filamentChanges }} ganti filament</template>
      </p>
      <p class="text-[10px] text-ink-400 leading-relaxed">
        3MF membawa proses Numa3D lengkap (bukan hanya layer/dinding). Slice di jendela Orca tetap bisa beda jika filament atau matriks flush di akun desktop sudah dikalibrasi.
      </p>
      <ul v-if="estimate.lines.length" class="space-y-0.5 font-mono text-ink-600">
        <li v-for="line in estimate.lines" :key="line.materialId">
          {{ line.materialName }} · {{ formatNumber(line.quantityUsed, 1) }} {{ line.unit }}
        </li>
      </ul>
      <p v-if="estimate.skipped.length" class="text-amber-700">
        Belum dipetakan ke material: {{ estimate.skipped.join(', ') }}. Pilih material di panel Warna.
      </p>
      <p v-if="hppPreview?.total" class="text-sm font-mono font-semibold">
        HPP katalog {{ formatIDR(hppPreview.total) }}
      </p>
      <label class="block">
        <span class="label !text-[10px]">Produk</span>
        <select v-model="productId" class="input text-sm">
          <option value="">— pilih —</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <label class="block">
        <span class="label !text-[10px]">Mesin (opsional)</span>
        <select v-model="machineId" class="input text-sm">
          <option value="">—</option>
          <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <button
        v-if="isAdmin"
        type="button"
        class="btn-primary w-full text-sm"
        :disabled="saving || !productId || !estimate.lines.length"
        @click="applyRecipe"
      >
        <CheckIcon class="w-4 h-4" />
        {{ saving ? 'Menyimpan…' : 'Isi recipe produksi' }}
      </button>
      <p v-else-if="selectedProduct" class="text-[10px] text-ink-400">Hanya admin yang bisa menulis recipe.</p>
      <p class="text-ink-500">Estimasi OrcaSlicer {{ sliced.slicerVersion }}. Bukan perintah ke printer.</p>
    </div>
  </section>
</template>
