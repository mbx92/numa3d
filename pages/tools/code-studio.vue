<script setup>
import { CodeBracketIcon, PlayIcon, StopIcon, ArrowDownTrayIcon, CloudArrowUpIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline'
import { CODE_STUDIO_CUSTOM, CODE_STUDIO_EXAMPLES } from '~/utils/codeStudioExamples.js'
import { compileCodeStudio } from '~/utils/codeStudioLanguage.js'
import { createCodeStudioGenerator } from '~/utils/codeStudioGenerator.js'
import { buildCodeStudioAiPrompt } from '~/utils/codeStudioAi.js'
import { resolveGeneratorPartExport } from '~/utils/generatorPartExport.js'
import { downloadBlob } from '~/utils/downloadBlob.js'

definePageMeta({ layout: 'tool', toolTitle: 'Code Studio', toolFullBleed: true })

const form = reactive({ label: 'Pelat berlubang', source: CODE_STUDIO_EXAMPLES[0].code, values: {}, colors: { base: '#f97316' } })
const exampleId = ref('plate')
const result = shallowRef(null)
const generating = ref(false)
const exporting = ref(false)
const saving = ref(false)
const error = ref('')
const format = ref('3mf')
const showGrid = ref(true)
const colorMode = ref('hex')
const materialIds = ref({})
const colorFields = [{ key: 'base', label: 'Model', short: 'Model', materialType: 'filament' }]
const toast = useToast()
const generateCodeStudio = createCodeStudioGenerator()
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const syntax = computed(() => {
  try { return { parameters: compileCodeStudio(form.source).parameters, error: '' } }
  catch (e) { return { parameters: [], error: e.message } }
})
watch(() => form.source, () => { form.values = {} }, { flush: 'sync' })

let controller = null
let serial = 0
const state = useGeneratorState(form, result, generateModel)
const { runGenerate, ensureFreshResult, isFresh } = state

async function generateModel() {
  const token = ++serial
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  generating.value = true
  error.value = ''
  const previous = result.value
  result.value = null
  await nextTick()
  previous?.dispose()
  if (token !== serial) return
  const revision = state.revision.value
  try {
    const output = await generateCodeStudio({
      source: form.source, values: { ...form.values }, label: form.label, color: form.colors.base
    }, { signal })
    if (token !== serial) { output.dispose(); return }
    result.value = output
    state.markGenerated(revision)
  } catch (e) {
    if (token === serial && e.name !== 'AbortError') error.value = e.message || 'Generate gagal'
  } finally {
    if (token === serial) generating.value = false
  }
}

function cancel() {
  serial++
  controller?.abort()
  state.invalidate()
  generating.value = false
}
function loadExample() {
  const example = exampleId.value
    ? CODE_STUDIO_EXAMPLES.find((entry) => entry.id === exampleId.value)
    : CODE_STUDIO_CUSTOM
  if (!example) return
  cancel()
  form.label = example.name
  form.source = example.code
  form.values = {}
  form.colors.base = example.color || '#f97316'
  materialIds.value = {}
  colorMode.value = 'hex'
  runGenerate()
}
function onEditorInput() {
  if (exampleId.value) exampleId.value = ''
}
function updateParameter(parameter, event) {
  const value = event.target.value === '' ? NaN : Number(event.target.value)
  form.values = { ...form.values, [parameter.name]: value }
}
function onEditorKey(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    runGenerate()
  }
}
async function downloadModel() {
  if (exporting.value || saving.value) return
  exporting.value = true
  try {
    if (!(await ensureFreshResult())) return
    const { blob, filename } = await resolveGeneratorPartExport(result.value, 'base', format.value)
    if (!blob) throw new Error('Hasil export kosong')
    downloadBlob(blob, filename)
    toast.success('Model berhasil diekspor')
  } catch (e) { toast.error(e.message || 'Export gagal') }
  finally { exporting.value = false }
}
async function saveToGallery() {
  if (!isAdmin.value || saving.value || exporting.value) return
  saving.value = true
  try {
    if (!(await ensureFreshResult())) return
    const { blob, filename } = await resolveGeneratorPartExport(result.value, 'base', format.value)
    if (!blob) throw new Error('Hasil export kosong')
    const body = new FormData()
    body.append('file', new File([blob], filename, { type: blob.type }))
    await $fetch('/api/library-files', { method: 'POST', body, timeout: 120000, retry: 0 })
    toast.success('Model disimpan ke Galeri 3D')
  } catch (e) { toast.error(e.data?.statusMessage || e.message || 'Upload gagal') }
  finally { saving.value = false }
}
function downloadCode() {
  const data = { version: 1, label: form.label, source: form.source, values: form.values, color: form.colors.base }
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'code-studio.numa3d.json')
}
async function copyAiPrompt() {
  try {
    await navigator.clipboard.writeText(buildCodeStudioAiPrompt())
    toast.success('Prompt DSL dan contoh disalin')
  } catch { toast.error('Clipboard tidak tersedia; periksa izin browser') }
}
async function openCode(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    if (file.size > 65536) throw new Error('File kode maksimal 64 KB')
    const data = JSON.parse(await file.text())
    if (data.version !== 1 || typeof data.source !== 'string' || !data.values || typeof data.values !== 'object' || Array.isArray(data.values)) throw new Error('Bukan file Code Studio versi 1')
    compileCodeStudio(data.source, data.values)
    cancel()
    form.source = data.source
    form.values = { ...data.values }
    form.label = String(data.label || 'Code Studio').slice(0, 64)
    form.colors = { base: /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : '#f97316' }
    materialIds.value = {}
    colorMode.value = 'hex'
    exampleId.value = ''
    runGenerate()
  } catch (e) { toast.error(e.message || 'File kode tidak valid') }
}
onMounted(runGenerate)
onBeforeUnmount(() => {
  cancel()
  generateCodeStudio.clearCache()
  result.value?.dispose()
  result.value = null
})
</script>

<template>
  <div class="studio h-full overflow-y-auto p-3 sm:p-4">
    <div class="flex flex-wrap items-center gap-3 mb-3">
      <CodeBracketIcon class="w-6 h-6 text-accent-600" />
      <div class="flex-1 min-w-0">
        <h2 class="font-semibold text-lg">Kode → model 3D</h2>
        <p class="text-sm text-ink-500">Sintaks JavaScript terbatas · mm · Z-up · satu solid akhir</p>
      </div>
      <button v-if="generating" class="btn-secondary" type="button" @click="cancel"><StopIcon class="w-4 h-4" /> Batal</button>
      <button class="btn-primary" type="button" :disabled="generating || exporting || saving || !!syntax.error" @click="runGenerate">
        <PlayIcon class="w-4 h-4" /> {{ generating ? 'Membentuk model…' : 'Generate' }}
      </button>
    </div>

    <div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 items-start">
      <section class="panel overflow-hidden min-w-0" aria-label="Editor kode">
        <div class="p-3 border-b border-ink-200 space-y-3">
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="text-sm">Nama model<input v-model="form.label" maxlength="64" class="input mt-1" /></label>
            <label class="text-sm">Mulai dari (mengganti kode)
              <select v-model="exampleId" class="input mt-1" @change="loadExample">
                <option value="">Kode sendiri</option>
                <option v-for="example in CODE_STUDIO_EXAMPLES" :key="example.id" :value="example.id">{{ example.name }}</option>
              </select>
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-secondary text-sm" type="button" @click="downloadCode">Simpan kode</button>
            <button class="btn-secondary text-sm" type="button" title="Salin prompt AI" @click="copyAiPrompt"><ClipboardDocumentIcon class="w-4 h-4" /> Prompt AI</button>
            <label class="btn-secondary text-sm cursor-pointer relative">Buka kode
              <input type="file" accept=".json" aria-label="Buka file kode Code Studio" class="absolute inset-0 opacity-0 cursor-pointer w-full" @change="openCode" />
            </label>
            <span class="text-xs text-ink-500">Ctrl / ⌘ + Enter untuk Generate</span>
          </div>
        </div>
        <label for="studio-code" class="sr-only">Kode model</label>
        <textarea id="studio-code" v-model="form.source" class="studio-code" spellcheck="false" autocapitalize="off" autocomplete="off" :maxlength="16000" aria-describedby="code-boundary" @keydown="onEditorKey" @input="onEditorInput" />
        <p v-if="syntax.error" class="p-3 text-sm text-red-700 bg-red-50" role="alert">{{ syntax.error }}</p>
        <p id="code-boundary" class="p-3 text-sm text-ink-500 border-t border-ink-200">Hanya fungsi pemodelan di bawah yang tersedia. Tidak mendukung import, loop, akses properti, DOM, jaringan, atau JavaScript bebas.</p>
        <details class="p-3 border-t border-ink-200 text-sm">
          <summary class="cursor-pointer font-medium">Referensi fungsi</summary>
          <div class="mt-3 space-y-2 text-ink-600 leading-relaxed">
            <p><code>box(w, d, h)</code> · <code>cylinder({ radius: 3, height: 10 })</code> · <code>sphere(radius)</code></p>
            <p><code>roundedBox(w, d, h, radius)</code> · <code>capsule({ radius: 5, height: 20 })</code></p>
            <p><code>hull(a, b, ...)</code> · <code>smoothUnion(a, b, radius)</code></p>
            <p><code>torus({ major: 30, minor: 8, arc: 220, taper: 0.6, flatten: 0.5, ridges: 6 })</code></p>
            <p><code>circle2d({ radius: 10 })</code> · <code>rect2d(w, d)</code> · <code>polygon({ sides: 6, radius: 20 })</code></p>
            <p><code>offset(p, delta)</code> · <code>union2d</code> / <code>subtract2d</code> / <code>intersect2d</code></p>
            <p><code>translate2d(p, [x,y])</code> · <code>rotate2d(p, deg)</code> · <code>scale2d(p, s)</code></p>
            <p><code>extrude(p, h)</code> · <code>revolve(p, { arc: 360, segments: 48 })</code> mengubah profil 2D menjadi solid. Tidak bisa <code>return</code> profil.</p>
            <p><code>union(a, b)</code> · <code>subtract(a, b)</code> · <code>intersect(a, b)</code></p>
            <p><code>translate(a, [x,y,z])</code> · <code>rotate(a, [x,y,z])</code> dalam derajat · <code>scale(a, [x,y,z])</code></p>
            <p><code>repeat(a, count, [dx,dy,dz])</code> membuat 1–32 salinan, lalu menggabungkannya.</p>
            <p><code>param("width", 60, { min: 20, max: 180, step: 1 })</code> membuat kontrol ukuran. Gunakan <code>const</code>, aritmetika <code>+ - * /</code>, dan akhiri dengan <code>return bentuk;</code>.</p>
            <p>Bentuk dasar berpusat di origin. Hasil akhir diturunkan ke Z=0. Maksimal 128 operasi, 200.000 segitiga per mesh, dan 30 detik per proses. Periksa toleransi dan support di slicer sebelum cetak.</p>
          </div>
        </details>
      </section>

      <div class="space-y-3 min-w-0">
        <section class="panel overflow-hidden" aria-label="Preview model">
          <div class="flex flex-wrap gap-2 justify-between p-3 border-b border-ink-200 text-sm">
            <span class="inline-flex items-baseline gap-2 min-w-0">
              <span class="font-medium">Preview 3D</span>
              <span class="text-xs text-ink-500 hidden sm:inline">Solid cetak, bukan foto</span>
            </span>
            <label class="inline-flex items-center gap-2"><input v-model="showGrid" type="checkbox" /> Grid</label>
          </div>
          <div class="studio-preview" :aria-busy="generating">
            <ClientOnly>
              <KeychainPreview v-if="result" :parts="result.basePreviewParts" :show-grid="showGrid" z-up-model />
              <div v-else class="h-full flex items-center justify-center text-ink-500 p-6 text-center" role="status">{{ generating ? 'Menghitung geometri… maksimal 30 detik' : 'Jalankan kode untuk melihat model.' }}</div>
              <template #fallback><div class="p-6 text-ink-500">Menyiapkan preview…</div></template>
            </ClientOnly>
          </div>
          <div v-if="result" class="p-3 text-sm flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-200 font-mono">
            <span>{{ result.dimensions.widthMm.toFixed(1) }} × {{ result.dimensions.depthMm.toFixed(1) }} × {{ result.dimensions.heightMm.toFixed(1) }} mm</span>
            <span>{{ (result.volumeMm3 / 1000).toFixed(2) }} cm³</span>
            <span>{{ result.triangles.toLocaleString('id-ID') }} segitiga</span>
          </div>
          <div v-if="result?.health" class="p-3 text-xs border-t border-ink-200 space-y-1" role="status">
            <p class="font-medium" :class="result.health.status === 'closed' ? 'text-emerald-700' : 'text-amber-800'">{{ result.health.status === 'closed' ? 'Mesh tertutup' : 'Mesh tertutup · peringatan' }} · {{ result.health.components }} bagian</p>
            <p v-for="warning in result.health.warnings" :key="warning" class="text-amber-800">{{ warning }}</p>
            <p class="text-ink-500">Ketebalan dinding, self-intersection, support, dan toleransi printer belum diverifikasi.</p>
          </div>
        </section>
        <p v-if="error" class="panel p-3 text-sm text-red-700 bg-red-50" role="alert">{{ error }}</p>
        <p v-if="result && !isFresh" class="panel p-3 text-sm text-amber-800 bg-amber-50" role="status">Kode atau parameter berubah. Ekspor akan membuat ulang model terlebih dahulu.</p>

        <section v-if="syntax.parameters.length" class="panel p-3 space-y-3" aria-label="Parameter model">
          <div class="flex items-center justify-between"><h3 class="font-semibold">Parameter</h3><button type="button" class="text-sm text-accent-700" @click="form.values = {}">Reset nilai</button></div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label v-for="parameter in syntax.parameters" :key="parameter.name" class="text-sm min-w-0">
              <span class="block truncate">{{ parameter.name }}</span>
              <input type="number" :value="form.values[parameter.name] ?? parameter.initial" :min="parameter.min" :max="parameter.max" :step="parameter.step" class="input mt-1" @input="updateParameter(parameter, $event)" />
              <span class="text-xs text-ink-500">{{ parameter.min }}–{{ parameter.max }}</span>
            </label>
          </div>
        </section>

        <section class="panel p-3 space-y-3" aria-label="Ekspor dan material">
          <h3 class="font-semibold">Material & ekspor</h3>
          <ToolColorBar v-model:colors="form.colors" v-model:mode="colorMode" v-model:material-ids="materialIds" :fields="colorFields" />
          <div class="flex flex-wrap gap-2">
            <label class="sr-only" for="studio-format">Format ekspor</label>
            <select id="studio-format" v-model="format" class="input !w-auto">
              <option value="3mf">3MF · plate 260 × 260</option><option value="stl">STL</option><option value="glb">GLB</option>
            </select>
            <button type="button" class="btn-primary" :disabled="generating || exporting || saving || !!syntax.error" @click="downloadModel"><ArrowDownTrayIcon class="w-4 h-4" /> {{ exporting ? 'Mengekspor…' : 'Unduh' }}</button>
            <button v-if="isAdmin" type="button" class="btn-secondary" :disabled="generating || saving || exporting || !!syntax.error" @click="saveToGallery"><CloudArrowUpIcon class="w-4 h-4" /> {{ saving ? 'Menyimpan…' : 'Galeri' }}</button>
          </div>
          <p class="text-xs text-ink-500">3MF mempertahankan ukuran dan warna, serta menolak model yang tidak muat plate. Belum termasuk support, brim, atau pengaturan cetak.</p>
          <GeneratorHppPanel :result="isFresh ? result : null" :color-fields="colorFields" :material-ids="materialIds" :colors="form.colors" :color-mode="colorMode" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio-code { display: block; width: 100%; min-height: 24rem; padding: 1rem; resize: vertical; background: #18212b; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .875rem; line-height: 1.75; tab-size: 2; border: 0; outline-offset: -3px; }
.studio-preview { height: clamp(20rem, 45vh, 34rem); }
.studio code { overflow-wrap: anywhere; }
</style>
