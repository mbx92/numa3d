<script setup>
definePageMeta({
  layout: 'tool',
  toolTitle: 'PNG → SVG'
})

import {
  PhotoIcon,
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/vue/24/outline'
import { downloadBlob } from '~/utils/downloadBlob.js'
import {
  PNG_TO_SVG_LIMITS,
  rasterFileToImageData,
  rasterToSvg
} from '~/utils/pngToSvg.js'

const toast = useToast()
const { toolLinkAttrs } = useStandaloneDisplay()

const fileName = ref('')
const imageData = ref(null)
const previewUrl = ref('')
const sourceSize = ref(null)
const result = ref(null)
const errorMsg = ref('')
const tracing = ref(false)
const dragging = ref(false)

const form = reactive({
  mode: 'silhouette',
  detectMode: 'auto',
  threshold: 128,
  invert: false,
  simplify: 1.2,
  despeckle: 8,
  maxColors: 4,
  skipLight: true,
  fill: '#111827',
  maxEdge: PNG_TO_SVG_LIMITS.defaultEdge
})

let traceTimer = 0
const loadedFile = ref(null)

const svgPreviewUrl = computed(() => {
  const svg = result.value?.svg
  if (!svg) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
})

const svgBytes = computed(() => {
  const svg = result.value?.svg
  if (!svg) return 0
  return new TextEncoder().encode(svg).length
})

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function scheduleTrace() {
  if (!imageData.value) return
  clearTimeout(traceTimer)
  tracing.value = true
  traceTimer = window.setTimeout(runTrace, 80)
}

function runTrace() {
  if (!imageData.value) {
    tracing.value = false
    return
  }
  errorMsg.value = ''
  try {
    result.value = rasterToSvg(imageData.value, {
      mode: form.mode,
      detectMode: form.detectMode,
      threshold: form.threshold,
      invert: form.invert,
      simplify: form.simplify,
      despeckle: form.despeckle,
      maxColors: form.maxColors,
      skipLight: form.skipLight,
      fill: form.fill
    })
  } catch (err) {
    result.value = null
    errorMsg.value = err?.message || 'Gagal menelusuri gambar'
  } finally {
    tracing.value = false
  }
}

watch(
  () => ({
    mode: form.mode,
    detectMode: form.detectMode,
    threshold: form.threshold,
    invert: form.invert,
    simplify: form.simplify,
    despeckle: form.despeckle,
    maxColors: form.maxColors,
    skipLight: form.skipLight,
    fill: form.fill
  }),
  () => scheduleTrace()
)

async function loadFile(file, { quiet } = {}) {
  if (!file) return
  tracing.value = true
  errorMsg.value = ''
  result.value = null
  try {
    const loaded = await rasterFileToImageData(file, { maxEdge: form.maxEdge })
    imageData.value = loaded.imageData
    previewUrl.value = loaded.previewUrl
    sourceSize.value = { width: loaded.sourceWidth, height: loaded.sourceHeight }
    fileName.value = file.name.replace(/\.(png|jpe?g|webp)$/i, '')
    loadedFile.value = file
    runTrace()
    if (!quiet) toast.success('Gambar siap ditelusuri')
  } catch (err) {
    toast.error(err?.message || 'Gagal membaca gambar')
    tracing.value = false
  }
}

async function reloadAtQuality() {
  if (!loadedFile.value) return
  await loadFile(loadedFile.value, { quiet: true })
}

function onFileChange(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  loadFile(file)
}

function onDrop(e) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}

function clearAll() {
  imageData.value = null
  previewUrl.value = ''
  sourceSize.value = null
  result.value = null
  errorMsg.value = ''
  fileName.value = ''
  loadedFile.value = null
}

function downloadSvg() {
  if (!result.value?.svg) return
  const name = `${fileName.value || 'trace'}.svg`
  downloadBlob(new Blob([result.value.svg], { type: 'image/svg+xml' }), name)
  toast.success(`Unduh ${name}`)
}

async function copySvg() {
  if (!result.value?.svg) return
  try {
    await navigator.clipboard.writeText(result.value.svg)
    toast.success('SVG disalin')
  } catch {
    toast.error('Gagal menyalin ke clipboard')
  }
}

onBeforeUnmount(() => {
  clearTimeout(traceTimer)
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-4">
    <div>
      <h1 class="text-xl font-bold">PNG → SVG</h1>
      <p class="text-sm text-ink-500 mt-1">
        Ubah logo atau siluet jadi path vektor — bisa diunggah ke Keychain, Clicker, atau Lightbox.
        Bukan gambar tertanam.
      </p>
    </div>

    <div class="grid lg:grid-cols-5 gap-4">
      <div class="lg:col-span-2 space-y-3">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Sumber</span>
            <button v-if="imageData" type="button" class="btn-secondary text-xs py-1.5 px-2" @click="clearAll">
              <XMarkIcon class="w-4 h-4" />
              Hapus
            </button>
          </div>
          <div class="p-3 space-y-3">
            <label
              class="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-8 cursor-pointer transition-colors"
              :class="
                dragging
                  ? 'border-accent-400 bg-accent-50/40'
                  : 'border-ink-200 bg-ink-50/50 hover:border-accent-400 hover:bg-accent-50/30'
              "
              @dragover.prevent="dragging = true"
              @dragleave="dragging = false"
              @drop.prevent="onDrop"
            >
              <PhotoIcon class="w-8 h-8 text-ink-400" />
              <span class="text-sm text-ink-700">Unggah PNG, JPG, atau WebP</span>
              <span class="text-[11px] text-ink-400">Maks. 8 MB · ditelusuri di browser</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                class="sr-only"
                @change="onFileChange"
              />
            </label>

            <label class="block space-y-1">
              <span class="label">Ketelitian</span>
              <select v-model.number="form.maxEdge" class="input" @change="reloadAtQuality">
                <option :value="256">Cepat (256 px)</option>
                <option :value="512">Seimbang (512 px)</option>
                <option :value="768">Detail (768 px)</option>
              </select>
            </label>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Penelusuran</span>
            <ArrowPathIcon v-if="tracing" class="w-4 h-4 text-ink-400 animate-spin" />
          </div>
          <div class="p-3 space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="btn text-xs h-9"
                :class="form.mode === 'silhouette' ? 'btn-primary' : 'btn-secondary'"
                @click="form.mode = 'silhouette'"
              >
                Siluet
              </button>
              <button
                type="button"
                class="btn text-xs h-9"
                :class="form.mode === 'color' ? 'btn-primary' : 'btn-secondary'"
                @click="form.mode = 'color'"
              >
                Warna
              </button>
            </div>

            <template v-if="form.mode === 'silhouette'">
              <label class="block space-y-1">
                <span class="label">Deteksi</span>
                <select v-model="form.detectMode" class="input">
                  <option value="auto">Otomatis</option>
                  <option value="luma">Gelap di atas terang</option>
                  <option value="alpha">Transparansi</option>
                </select>
              </label>
              <label v-if="form.detectMode !== 'alpha'" class="block space-y-1">
                <span class="label">Threshold {{ form.threshold }}</span>
                <input v-model.number="form.threshold" type="range" min="16" max="240" step="1" class="w-full" />
              </label>
              <label class="flex items-center gap-2 text-sm text-ink-700">
                <input v-model="form.invert" type="checkbox" class="rounded border-ink-300" />
                Invert
              </label>
              <label class="block space-y-1">
                <span class="label">Warna isi</span>
                <input v-model="form.fill" type="color" class="h-10 w-full rounded-panel border border-ink-300 p-1" />
              </label>
            </template>

            <template v-else>
              <label class="block space-y-1">
                <span class="label">Jumlah warna {{ form.maxColors }}</span>
                <input v-model.number="form.maxColors" type="range" min="2" max="8" step="1" class="w-full" />
              </label>
              <label class="flex items-center gap-2 text-sm text-ink-700">
                <input v-model="form.skipLight" type="checkbox" class="rounded border-ink-300" />
                Abaikan putih / latar
              </label>
            </template>

            <label class="block space-y-1">
              <span class="label">Sederhanakan {{ Number(form.simplify).toFixed(1) }} px</span>
              <input v-model.number="form.simplify" type="range" min="0" max="4" step="0.1" class="w-full" />
            </label>
            <label class="block space-y-1">
              <span class="label">Buang bintik {{ form.despeckle }} px</span>
              <input v-model.number="form.despeckle" type="range" min="0" max="80" step="1" class="w-full" />
            </label>
          </div>
        </div>
      </div>

      <div class="lg:col-span-3 space-y-3">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Preview</span>
            <span v-if="result" class="text-[11px] text-ink-500">
              {{ result.width }}×{{ result.height }}
              <span v-if="sourceSize">
                · sumber {{ sourceSize.width }}×{{ sourceSize.height }}
              </span>
              · {{ result.pathCount }} path · {{ formatBytes(svgBytes) }}
            </span>
          </div>
          <div class="p-3">
            <p v-if="errorMsg" class="text-sm text-red-600 mb-3">{{ errorMsg }}</p>
            <div v-if="!imageData" class="rounded-lg border border-ink-100 bg-ink-50 min-h-[16rem] flex items-center justify-center text-sm text-ink-400">
              Unggah gambar untuk melihat hasil vektor
            </div>
            <div v-else class="grid sm:grid-cols-2 gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">Asli</p>
                <div class="rounded-lg border border-ink-200 bg-[linear-gradient(45deg,#eef1f4_25%,transparent_25%,transparent_75%,#eef1f4_75%),linear-gradient(45deg,#eef1f4_25%,transparent_25%,transparent_75%,#eef1f4_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] min-h-[12rem] flex items-center justify-center p-3">
                  <img :src="previewUrl" alt="Gambar asli" class="max-h-56 max-w-full object-contain" />
                </div>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1.5">SVG</p>
                <div class="rounded-lg border border-ink-200 bg-white min-h-[12rem] flex items-center justify-center p-3">
                  <img v-if="svgPreviewUrl" :src="svgPreviewUrl" alt="Hasil SVG" class="max-h-56 max-w-full object-contain" />
                  <span v-else class="text-sm text-ink-400">{{ tracing ? 'Menelusuri…' : 'Tidak ada path' }}</span>
                </div>
              </div>
            </div>
            <div v-if="result?.layers?.length" class="flex flex-wrap gap-1.5 mt-3">
              <span
                v-for="layer in result.layers"
                :key="layer.color"
                class="inline-flex items-center gap-1.5 text-[11px] text-ink-600 bg-ink-50 border border-ink-200 rounded-full px-2 py-0.5"
              >
                <span class="w-3 h-3 rounded-sm border border-ink-200" :style="{ background: layer.color }" />
                {{ layer.color }} · {{ layer.pathCount }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-primary" :disabled="!result?.svg" @click="downloadSvg">
            <ArrowDownTrayIcon class="w-4 h-4" />
            Unduh SVG
          </button>
          <button type="button" class="btn-secondary" :disabled="!result?.svg" @click="copySvg">
            <ClipboardDocumentIcon class="w-4 h-4" />
            Salin
          </button>
          <NuxtLink to="/tools/keychain" v-bind="toolLinkAttrs" class="btn-secondary">Keychain</NuxtLink>
          <NuxtLink to="/tools/clicker" v-bind="toolLinkAttrs" class="btn-secondary">Clicker</NuxtLink>
        </div>
        <p class="text-xs text-ink-400">
          Hasil berupa <code class="text-[11px] bg-ink-100 px-1 rounded">&lt;path&gt;</code>
          dengan <code class="text-[11px] bg-ink-100 px-1 rounded">fill-rule="evenodd"</code>
          supaya lubang (huruf O, dll.) tetap bolong.
        </p>
      </div>
    </div>
  </div>
</template>
