<script setup>
import { CheckIcon, ClipboardDocumentListIcon } from '@heroicons/vue/24/outline'
import { computeHpp } from '~/utils/hpp.js'
import { slicerToEstimateLines } from '~/utils/meshHppEstimate.js'
import { generatorProductRecipes } from '~/utils/generatorProduct.js'

const props = defineProps({
  result: { type: Object, default: null },
  tool: { type: String, required: true },
  modelName: { type: String, default: '' },
  printOptions: { type: Object, default: () => ({}) },
  colorFields: { type: Array, default: () => [] },
  materialIds: { type: Object, default: () => ({}) },
  colors: { type: Object, default: () => ({}) },
  colorMode: { type: String, default: 'material' },
  switchMaterialId: { type: [Number, String], default: null }
})

const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const toast = useToast()
const { data: materials } = await useFetch('/api/materials', { server: false, lazy: true })
const { data: machines } = await useFetch('/api/machines', { server: false, lazy: true })
const { data: settings } = await useFetch('/api/settings', { server: false, lazy: true })
const { data: slicerStatus } = await useFetch('/api/slicer/status', { server: false, lazy: true })

const productName = ref('')
const savedProduct = shallowRef(null)
let slicedModelBlob = null
let saveRequestId = null
const machineId = useState('generatorMachineId', () => '')
const sliced = shallowRef(null)
const activeJob = shallowRef(null)
const busy = ref(false)
const saving = ref(false)
const error = ref('')
let requestVersion = 0
watch(machines, (rows) => {
  if (!machineId.value && rows?.length) machineId.value = rows[0].id
}, { immediate: true })
watch(() => [props.result, props.printOptions.processPreset], () => {
  sliced.value = null
  activeJob.value = null
  slicedModelBlob = null
  savedProduct.value = null
  saveRequestId = null
  productName.value = (props.modelName || props.result?.slug || '').slice(0, 120)
  error.value = ''
  requestVersion++
}, { immediate: true })

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
const missingMaterialFields = computed(() => {
  const byId = new Map((materials.value || []).map((material) => [Number(material.id), material]))
  return props.colorFields.filter((field) => {
    const material = byId.get(Number(props.materialIds[field.key]))
    return !material || (field.materialType && material.type !== field.materialType)
  })
})
const materialsReady = computed(() => !props.colorFields.length || !missingMaterialFields.value.length)
const completeMaterials = computed(() => estimate.value.lines.length > 0 && !estimate.value.skipped.length && estimate.value.lines.every((line) => line.material))
const hppPreview = computed(() => {
  if (!completeMaterials.value) return null
  const machine = (machines.value || []).find((m) => Number(m.id) === Number(machineId.value)) || null
  const recipes = generatorProductRecipes(estimate.value.lines, {
    printTimeSeconds: sliced.value.printTimeSeconds, machineId: machineId.value
  }).map((row, index) => ({ ...row, material: estimate.value.lines[index].material, machine: row.machineId ? machine : null }))
  return computeHpp(recipes, [], settings.value)
})

async function slice() {
  if (busy.value || saving.value || !props.result) return
  if (!materialsReady.value) {
    error.value = (materials.value || []).length
      ? `Pilih material untuk ${missingMaterialFields.value.map((field) => field.label || field.key).join(', ')} sebelum slicing.`
      : 'Belum ada material yang sesuai. Tambahkan material terlebih dahulu sebelum slicing.'
    return
  }
  busy.value = true
  error.value = ''
  sliced.value = null
  slicedModelBlob = null
  savedProduct.value = null
  saveRequestId = null
  const version = ++requestVersion
  try {
    const model = props.result
    const exporter = model.getPlate3mfBlob || model.get3mfBlob
    if (!exporter) throw new Error('Model belum mendukung slicing')
    const options = { ...props.printOptions }
    const body = new FormData()
    const blob = await exporter.call(model, options)
    body.append('file', blob, 'model.3mf')
    body.append('tool', props.tool)
    body.append('includeProfile', String(options.processPreset !== null))
    let job = await $fetch('/api/slicer/jobs', { method: 'POST', body, retry: 0 })
    if (version === requestVersion) activeJob.value = job
    while (version === requestVersion && ['queued', 'processing'].includes(job.status)) {
      job = await $fetch(`/api/slicer/jobs/${job.id}`, { retry: 0 })
      if (version !== requestVersion) return
      activeJob.value = job
      if (['queued', 'processing'].includes(job.status)) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    if (version !== requestVersion) return
    if (job.status === 'completed' && job.result) {
      sliced.value = job.result
      slicedModelBlob = blob
      saveRequestId = crypto.randomUUID()
    } else if (job.status === 'cancelled') {
      throw new Error('Slicing dibatalkan')
    } else {
      throw new Error(job.error || 'Worker gagal melakukan slicing')
    }
  } catch (e) {
    if (version === requestVersion) error.value = e.data?.statusMessage || e.message || 'Slicing gagal'
  } finally { busy.value = false }
}

async function saveNewProduct() {
  if (saving.value || busy.value || !props.result || !isAdmin.value || !productName.value.trim() || !completeMaterials.value || !slicedModelBlob || savedProduct.value) return
  saving.value = true
  const version = requestVersion
  try {
    const body = new FormData()
    body.append('file', slicedModelBlob, 'model.3mf')
    body.append('product', JSON.stringify({
      requestId: saveRequestId, name: productName.value.trim(), tool: props.tool,
      machineId: machineId.value || null, printTimeSeconds: sliced.value.printTimeSeconds,
      materials: estimate.value.lines.map((line) => ({ materialId: line.materialId, quantityUsed: line.quantityUsed }))
    }))
    const product = await $fetch('/api/products/from-generator', { method: 'POST', body, retry: 0 })
    if (version === requestVersion) savedProduct.value = product
    toast.success(`Produk baru "${product.name}" tersimpan beserta model 3MF dan recipe.`)
  } catch (e) {
    toast.error(e.data?.statusMessage || e.message || 'Gagal membuat produk baru')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-2 pt-3 border-t border-ink-200">
    <h3 class="text-sm font-semibold">HPP &amp; produk baru</h3>
    <p class="text-[10px]" :class="slicerStatus?.ready ? 'text-emerald-700' : 'text-amber-700'">
      {{ slicerStatus?.message || 'Memeriksa OrcaSlicer di server…' }}
    </p>
    <button type="button" class="btn-primary w-full text-sm" :disabled="busy || saving || !result || !materialsReady" @click="slice">
      {{ busy ? (activeJob?.stage || (activeJob?.status === 'queued' ? 'Menunggu worker…' : 'OrcaSlicer sedang memproses…')) : 'Slice gram & waktu' }}
    </button>
    <p v-if="slicerStatus?.ready === false" class="text-[10px] text-amber-700">Job tetap dapat ditambahkan dan akan diproses saat worker kembali aktif.</p>
    <NuxtLink v-if="activeJob" :to="`/slicer-queue?job=${activeJob.id}`" class="block text-[10px] text-accent-700 hover:underline">
      Lihat antrean slicing #{{ activeJob.id }}
    </NuxtLink>
    <p v-if="!result" class="text-xs text-ink-500">Generate model dulu sebelum slicing.</p>
    <p v-else-if="!materialsReady" class="text-xs text-amber-700">
      Pilih material untuk {{ missingMaterialFields.map((field) => field.label || field.key).join(', ') }} sebelum slicing.
    </p>
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
      <InfoTooltip label="Informasi GeneratorSliceHpp">
        3MF membawa proses Numa3D lengkap (bukan hanya layer/dinding). Slice di jendela Orca tetap bisa beda jika filament atau matriks flush di akun desktop sudah dikalibrasi.
      </InfoTooltip>
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
        <span class="label !text-[10px]">Nama produk baru</span>
        <input v-model="productName" class="input text-sm" maxlength="120" placeholder="Nama model custom" :disabled="saving || !!savedProduct" />
      </label>
      <label class="block">
        <span class="label !text-[10px]">Mesin (opsional)</span>
        <select v-model="machineId" class="input text-sm" :disabled="saving || !!savedProduct">
          <option value="">—</option>
          <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <button
        v-if="isAdmin"
        type="button"
        class="btn-primary w-full text-sm"
        :disabled="saving || busy || !productName.trim() || !completeMaterials || !!savedProduct"
        @click="saveNewProduct"
      >
        <CheckIcon class="w-4 h-4" />
        {{ saving ? 'Menyimpan…' : savedProduct ? 'Produk sudah tersimpan' : 'Simpan sebagai produk baru' }}
      </button>
      <p v-else class="text-[10px] text-ink-400">Hanya admin yang bisa membuat produk.</p>
      <div v-if="savedProduct" class="flex flex-wrap gap-2">
        <NuxtLink :to="`/products/${savedProduct.id}`" class="btn-secondary">Buka produk</NuxtLink>
        <NuxtLink :to="`/orders?new=1&productId=${savedProduct.id}`" class="btn-primary">
          <ClipboardDocumentListIcon class="w-4 h-4" />Buat order
        </NuxtLink>
      </div>
      <InfoTooltip label="Informasi GeneratorSliceHpp">Estimasi OrcaSlicer {{ sliced.slicerVersion }}. Bukan perintah ke printer.</InfoTooltip>
    </div>
  </section>
</template>
