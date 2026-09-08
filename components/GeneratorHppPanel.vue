<script setup>
import { CheckIcon } from '@heroicons/vue/24/outline'
import { computeHpp, suggestedPrettyPrice } from '~/utils/hpp.js'
import {
  DEFAULT_FILAMENT_DENSITY,
  DEFAULT_INFILL_PERCENT,
  DEFAULT_WASTE_PERCENT,
  collectGeneratorExportParts,
  estimateMaterialLines,
  mergeGeneratorRecipe
} from '~/utils/meshHppEstimate.js'

const props = defineProps({
  result: { type: Object, default: null },
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

const productId = ref('')
const machineId = ref('')
const infillPercent = ref(DEFAULT_INFILL_PERCENT)
const wastePercent = ref(DEFAULT_WASTE_PERCENT)
const density = ref(DEFAULT_FILAMENT_DENSITY)
const saving = ref(false)

const assignedCount = computed(() => Object.values(props.materialIds || {}).filter((id) => Number(id) > 0).length)
const needsMaterial = computed(() => assignedCount.value < 1)

const exportParts = computed(() => collectGeneratorExportParts(props.result))

const estimate = computed(() =>
  estimateMaterialLines(exportParts.value, {
    colorFields: props.colorFields,
    materialIds: props.materialIds,
    colors: props.colors,
    materials: materials.value || [],
    density: density.value,
    infillPercent: infillPercent.value,
    wastePercent: wastePercent.value,
    switchMaterialId: props.switchMaterialId
  })
)

const selectedProduct = computed(() =>
  (products.value || []).find((p) => Number(p.id) === Number(productId.value))
)

const hppPreview = computed(() => {
  const machine = (machines.value || []).find((m) => Number(m.id) === Number(machineId.value)) || null
  const recipes = estimate.value.lines.map((line, i) => ({
    materialId: line.materialId,
    quantityUsed: line.quantityUsed,
    printTimeMinutes: 0,
    failureRatePercent: 5,
    laborMinutes: 0,
    laborRatePerHour: 0,
    material: line.material,
    machine: i === 0 ? machine : null
  }))
  return computeHpp(recipes, [], settings.value)
})

const suggested = computed(() =>
  suggestedPrettyPrice(
    hppPreview.value.total,
    settings.value?.defaultMarginPercent,
    settings.value?.priceRoundStep
  )
)

async function applyRecipe() {
  if (!isAdmin.value || !productId.value || !estimate.value.lines.length) return
  saving.value = true
  try {
    const product = await $fetch(`/api/products/${productId.value}`)
    const body = mergeGeneratorRecipe({
      existingRecipes: product.recipes || [],
      existingPackaging: product.packaging || [],
      estimateLines: estimate.value.lines,
      materials: materials.value || [],
      machineId: machineId.value || null
    })
    if (!body.recipes.length) throw new Error('Tidak ada baris recipe untuk disimpan')
    await $fetch(`/api/products/${productId.value}/recipe`, { method: 'PUT', body })
    toast.success(`Recipe ${product.name} diisi dari generator.`)
  } catch (e) {
    toast.error(e.data?.statusMessage || e.message || 'Gagal mengisi recipe')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-2 pt-2 border-t border-ink-200">
    <p class="text-xs font-medium text-ink-700">HPP ke produk</p>
    <p class="text-[10px] text-ink-400 leading-relaxed">
      Estimasi gram dari volume mesh × infill, bukan hasil Orca. Waktu cetak tetap di tab Recipe produk.
    </p>

    <p v-if="needsMaterial" class="text-[11px] text-amber-700">
      Pilih material di panel Warna (mode Material). Mode 1 warna tidak mengisi recipe.
    </p>

    <template v-else>
      <div class="grid grid-cols-3 gap-1.5">
        <label class="block">
          <span class="label !text-[10px]">Infill %</span>
          <input v-model.number="infillPercent" type="number" min="1" max="100" class="input-num w-full text-sm" />
        </label>
        <label class="block">
          <span class="label !text-[10px]">Waste %</span>
          <input v-model.number="wastePercent" type="number" min="0" max="50" class="input-num w-full text-sm" />
        </label>
        <label class="block">
          <span class="label !text-[10px]">Density</span>
          <input v-model.number="density" type="number" min="0.8" max="2" step="0.01" class="input-num w-full text-sm" />
        </label>
      </div>

      <ul v-if="estimate.lines.length" class="text-[11px] space-y-0.5 font-mono text-ink-600">
        <li v-for="line in estimate.lines" :key="line.materialId">
          {{ line.materialName }} · {{ formatNumber(line.quantityUsed, 1) }} {{ line.unit }}
        </li>
      </ul>
      <p v-else class="text-[11px] text-ink-400">Tidak ada volume yang bisa dihitung.</p>
      <p v-if="estimate.skipped.length" class="text-[10px] text-amber-700">
        Tanpa material: {{ estimate.skipped.join(', ') }}
      </p>

      <p v-if="hppPreview.total" class="text-sm font-mono font-semibold">
        HPP {{ formatIDR(hppPreview.total) }}
        <span v-if="suggested" class="text-ink-400 font-normal text-[11px]"> · saran {{ formatIDR(suggested) }}</span>
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
        {{ saving ? 'Menyimpan…' : 'Isi recipe' }}
      </button>
      <p v-else-if="selectedProduct" class="text-[10px] text-ink-400">Hanya admin yang bisa menulis recipe.</p>
    </template>
  </div>
</template>
