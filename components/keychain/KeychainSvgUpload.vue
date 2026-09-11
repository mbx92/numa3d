<script setup>
import { PhotoIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { readSvgFile } from '~/utils/svgToShapes.js'

const svgContent = defineModel('svgContent', { type: String, default: '' })
const svgSizeMm = defineModel('svgSizeMm', { type: Number, default: 14 })
const svgGapMm = defineModel('svgGapMm', { type: Number, default: 2 })
const { toolLinkAttrs } = useStandaloneDisplay()

const props = defineProps({
  label: { type: String, default: 'Logo SVG (opsional)' },
  hint: { type: String, default: 'Warna aksen' },
  sizeLabel: { type: String, default: 'Ukuran logo' },
  sizeMin: { type: Number, default: 6 },
  sizeMax: { type: Number, default: 28 },
  sizeStep: { type: Number, default: 0.5 },
  showGap: { type: Boolean, default: true }
})

const previewUrl = ref('')

watch(
  svgContent,
  (raw) => {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = raw
      ? URL.createObjectURL(new Blob([raw], { type: 'image/svg+xml' }))
      : ''
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

async function onFileChange(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const toast = useToast()
    const svg = await readSvgFile(file)
    svgContent.value = svg
    // File besar dengan embed raster → setelah strip jadi jauh lebih kecil
    if (file.size > 180 * 1024 && svg.length < file.size * 0.75) {
      toast.info('Gambar latar di SVG diabaikan — hanya path vektor (QR/logo) yang dipakai')
    } else {
      toast.success('SVG siap')
    }
  } catch (err) {
    useToast().error(err?.message || 'Gagal membaca SVG')
  }
}

function clearSvg() {
  svgContent.value = ''
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-ink-700">{{ label }}</span>
      <span v-if="hint" class="text-[10px] text-ink-400">{{ hint }}</span>
    </div>

    <div
      v-if="svgContent && previewUrl"
      class="relative rounded-lg border border-ink-200 bg-ink-50 p-3 flex items-center justify-center min-h-[4.5rem]"
    >
      <img :src="previewUrl" alt="Preview logo SVG" class="max-h-16 max-w-full object-contain" />
      <button
        type="button"
        class="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 border border-ink-200 text-ink-500 hover:text-red-600"
        title="Hapus logo"
        @click="clearSvg"
      >
        <XMarkIcon class="w-4 h-4" />
      </button>
    </div>

    <div v-else class="space-y-1.5">
      <label
        class="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-200 bg-ink-50/50 px-3 py-4 cursor-pointer hover:border-accent-400 hover:bg-accent-50/30 transition-colors"
      >
        <PhotoIcon class="w-6 h-6 text-ink-400" />
        <span class="text-xs text-ink-600">Unggah file .svg</span>
        <span class="text-[10px] text-ink-400">Maks. 1 MB · bidang dan garis SVG (gambar tertanam diabaikan)</span>
        <input type="file" accept=".svg,image/svg+xml" class="sr-only" @change="onFileChange" />
      </label>
      <p class="text-[10px] text-ink-400">
        Punya PNG?
        <NuxtLink to="/tools/png-to-svg" v-bind="toolLinkAttrs" class="text-accent-600 hover:underline">PNG → SVG</NuxtLink>
      </p>
    </div>

    <template v-if="svgContent">
      <label class="block space-y-1">
        <span class="text-[11px] text-ink-600">{{ sizeLabel }}</span>
        <div class="flex items-center gap-2">
          <input v-model.number="svgSizeMm" type="range" :min="sizeMin" :max="sizeMax" :step="sizeStep" class="flex-1" />
          <span class="text-xs font-mono text-ink-700 w-12 text-right">{{ svgSizeMm }} mm</span>
        </div>
      </label>
      <label v-if="showGap" class="block space-y-1">
        <span class="text-[11px] text-ink-600">Jarak ke teks</span>
        <div class="flex items-center gap-2">
          <input v-model.number="svgGapMm" type="range" min="0" max="8" step="0.5" class="flex-1" />
          <span class="text-xs font-mono text-ink-700 w-12 text-right">{{ svgGapMm }} mm</span>
        </div>
      </label>
    </template>
  </div>
</template>
