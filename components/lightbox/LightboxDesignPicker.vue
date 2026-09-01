<script setup>

import { DESIGN_MODES } from '~/utils/lightboxPresets.js'

import { readImageFile } from '~/utils/imageToLayers.js'

import { readSvgFile } from '~/utils/svgToShapes.js'



const designMode = defineModel('designMode', { type: String, default: 'text' })

const text = defineModel('text', { type: String, default: '' })

const fontUrl = defineModel('fontUrl', { type: String, default: '' })

const svgContent = defineModel('svgContent', { type: String, default: '' })

const imageDataUrl = defineModel('imageDataUrl', { type: String, default: '' })

const maxSizeMm = defineModel('maxSizeMm', { type: Number, default: 80 })

const maxColors = defineModel('maxColors', { type: Number, default: 4 })



const modes = DESIGN_MODES

const imageError = ref('')

const imagePreview = computed(() => imageDataUrl.value || '')



async function onImageFile(event) {

  imageError.value = ''

  const file = event.target.files?.[0]

  if (!file) return

  try {

    imageDataUrl.value = await readImageFile(file)

  } catch (e) {

    imageError.value = e?.message || 'Gagal membaca gambar'

  }

  event.target.value = ''

}



async function onSvgFile(event) {

  const file = event.target.files?.[0]

  if (!file) return

  try {

    svgContent.value = await readSvgFile(file)

  } catch (e) {

    imageError.value = e?.message || 'Gagal membaca SVG'

  }

  event.target.value = ''

}



function clearImage() {

  imageDataUrl.value = ''

  imageError.value = ''

}

</script>



<template>

  <div class="space-y-3">

    <div>

      <span class="text-xs font-medium text-ink-700">Sumber desain</span>

      <div class="grid grid-cols-3 gap-1.5 mt-1.5">

        <button

          v-for="m in modes"

          :key="m.id"

          type="button"

          class="rounded-lg border px-2 py-2 text-left transition-colors"

          :class="

            designMode === m.id

              ? 'border-accent-400 bg-accent-50 ring-1 ring-accent-200'

              : 'border-ink-200 hover:border-ink-300'

          "

          @click="designMode = m.id"

        >

          <span class="block text-xs font-medium text-ink-800">{{ m.label }}</span>

          <span class="block text-[10px] text-ink-400 leading-snug mt-0.5">{{ m.description }}</span>

        </button>

      </div>

    </div>



    <template v-if="designMode === 'text'">

      <label class="block space-y-1">

        <span class="text-xs font-medium text-ink-700">Teks</span>

        <input v-model="text" class="input text-sm font-semibold" maxlength="24" placeholder="NUMA" />

      </label>

      <KeychainFontPicker v-model="fontUrl" :preview-text="text || 'NUMA'" :show-downloader-link="false" />

    </template>



    <template v-else-if="designMode === 'image'">

      <label class="block space-y-1.5">

        <span class="text-xs font-medium text-ink-700">Upload gambar</span>

        <input type="file" accept="image/png,image/jpeg,image/webp" class="input text-xs" @change="onImageFile" />

        <p class="text-[10px] text-ink-400">PNG/JPG/WebP — logo, kartun, atau grafis flat. Maks. 2 MB.</p>

      </label>

      <div v-if="imagePreview" class="relative rounded-lg border border-ink-200 overflow-hidden bg-checker">

        <img :src="imagePreview" alt="Preview" class="w-full max-h-32 object-contain" />

        <button

          type="button"

          class="absolute top-1 right-1 text-[10px] bg-white/90 px-1.5 py-0.5 rounded border border-ink-200 hover:bg-white"

          @click="clearImage"

        >

          Hapus

        </button>

      </div>

      <label class="block space-y-1">

        <span class="text-xs font-medium text-ink-700">Jumlah warna (AMS)</span>

        <div class="flex items-center gap-2">

          <input v-model.number="maxColors" type="range" min="2" max="8" step="1" class="flex-1" />

          <span class="text-xs font-mono w-6 text-right">{{ maxColors }}</span>

        </div>

      </label>

    </template>



    <template v-else-if="designMode === 'svg'">

      <label class="block space-y-1.5">

        <span class="text-xs font-medium text-ink-700">Upload SVG</span>

        <input type="file" accept=".svg,image/svg+xml" class="input text-xs" @change="onSvgFile" />

      </label>

      <KeychainSvgUpload

        v-if="svgContent"

        v-model:svg-content="svgContent"

        :svg-size-mm="maxSizeMm"

        :svg-gap-mm="0"

        @update:svg-size-mm="maxSizeMm = $event"

      />

    </template>



    <label v-if="designMode !== 'svg' || !svgContent" class="block space-y-1">

      <span class="text-xs font-medium text-ink-700">Ukuran maks. (mm)</span>

      <div class="flex items-center gap-2">

        <input v-model.number="maxSizeMm" type="range" min="40" max="150" step="2" class="flex-1" />

        <span class="text-xs font-mono w-10 text-right">{{ maxSizeMm }}</span>

      </div>

      <p class="text-[10px] text-ink-400">Seperti MakerWorld — skala otomatis 40–150 mm.</p>

    </label>



    <p v-if="imageError" class="text-xs text-red-600">{{ imageError }}</p>

  </div>

</template>



<style scoped>

.bg-checker {

  background-image:

    linear-gradient(45deg, #e5e7eb 25%, transparent 25%),

    linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),

    linear-gradient(45deg, transparent 75%, #e5e7eb 75%),

    linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);

  background-size: 12px 12px;

  background-position:

    0 0,

    0 6px,

    6px -6px,

    -6px 0;

  background-color: #f9fafb;

}

</style>

