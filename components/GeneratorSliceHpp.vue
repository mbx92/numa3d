<script setup>
import { SLICER_COST_DEFAULTS, computeSlicerHpp } from '~/utils/slicerHpp.js'

const props = defineProps({
  result: { type: Object, default: null },
  tool: { type: String, required: true },
  printOptions: { type: Object, default: () => ({}) }
})
const costs = reactive({ ...SLICER_COST_DEFAULTS })
const sliced = shallowRef(null)
const busy = ref(false)
const error = ref('')
let requestVersion = 0
watch(() => [props.result, props.printOptions.processPreset], () => { sliced.value = null; error.value = ''; requestVersion++ })
const costFields = [
  ['filamentPricePerKg', 'PLA / kg (Rp)'], ['powerWatt', 'Daya rata-rata (W)'],
  ['machinePrice', 'Harga mesin (Rp)'], ['depreciationMonths', 'Depresiasi (bulan)'],
  ['machineHoursPerMonth', 'Pemakaian mesin (jam/bulan)'], ['electricityRate', 'Listrik / kWh (Rp)'],
  ['failurePercent', 'Buffer gagal (%)'], ['laborMinutes', 'Tenaga kerja (menit/plate)'],
  ['laborRatePerHour', 'Upah / jam (Rp)'], ['packagingCost', 'Kemasan / plate (Rp)'],
  ['extraPartsCost', 'Switch/komponen / plate (Rp)']
]
const breakdownLabels = { materialCost: 'Material & komponen', failureBuffer: 'Buffer gagal', electricityCost: 'Listrik', depreciationCost: 'Depresiasi', laborCost: 'Tenaga kerja', packagingCost: 'Kemasan' }
const calculation = computed(() => {
  try { return { hpp: computeSlicerHpp(sliced.value, costs), error: '' } }
  catch (e) { return { hpp: null, error: e.message } }
})
const duration = computed(() => sliced.value ? `${Math.floor(sliced.value.printTimeSeconds / 60)} menit ${Math.round(sliced.value.printTimeSeconds % 60)} detik` : '')

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
    body.append('costs', JSON.stringify(costs))
    const response = await $fetch('/api/slicer/slice', { method: 'POST', body, timeout: 200000, retry: 0 })
    if (version === requestVersion) sliced.value = response
  } catch (e) {
    if (version === requestVersion) error.value = e.data?.statusMessage || e.message || 'Slicing gagal'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="space-y-2 pt-3 border-t border-ink-200">
    <h3 class="text-sm font-semibold">HPP hasil slicing</h3>
    <button type="button" class="btn-primary w-full text-sm" :disabled="busy || !result" @click="slice">
      {{ busy ? 'OrcaSlicer sedang memproses…' : 'Slice & hitung HPP' }}
    </button>
    <p v-if="!result" class="text-xs text-ink-500">Generate model untuk menghitung HPP.</p>
    <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
    <details class="text-xs">
      <summary class="cursor-pointer text-ink-600">Asumsi biaya · dapat diubah</summary>
      <div class="grid grid-cols-2 gap-2 mt-2">
        <label v-for="[key, label] in costFields" :key="key" class="block min-w-0">
          <span class="label !text-[10px]">{{ label }}</span>
          <input v-model.number="costs[key]" type="number" min="0" step="any" class="input-num w-full text-sm" />
        </label>
      </div>
    </details>
    <p v-if="calculation.error" class="text-xs text-red-600">{{ calculation.error }}</p>
    <div v-if="sliced" class="space-y-2 text-xs">
      <p class="font-medium">{{ formatNumber(sliced.totalGrams, 2) }} g PLA · {{ duration }}</p>
      <ul class="space-y-1 text-ink-500">
        <li v-for="(grams, index) in sliced.filamentGrams" :key="index" class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full border border-ink-200" :style="{ backgroundColor: sliced.colors[index] }" />
          Warna {{ index + 1 }}: {{ formatNumber(grams, 2) }} g
        </li>
      </ul>
      <dl v-if="calculation.hpp" class="grid grid-cols-2 gap-1">
        <template v-for="(label, key) in breakdownLabels" :key="key">
          <dt class="text-ink-500">{{ label }}</dt><dd class="text-right font-mono">{{ formatIDR(calculation.hpp.breakdown[key]) }}</dd>
        </template>
      </dl>
      <p v-if="calculation.hpp" class="font-semibold text-base">HPP / plate {{ formatIDR(calculation.hpp.total) }}</p>
      <p class="text-ink-500">Gram dan waktu: estimasi OrcaSlicer {{ sliced.slicerVersion }}. Harga dan biaya memakai asumsi di atas. Komponen switch dihitung jika biayanya diisi.</p>
    </div>
  </section>
</template>
