<script setup>
import { QrCodeIcon, PlayIcon, StopIcon, ArrowDownTrayIcon, CloudArrowUpIcon, PhotoIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { QR_PLATE_DEFAULTS, createQrPlateDesign, qrPlateSvg } from '~/utils/qrPlateDesign.js'
import { generateQrPlate } from '~/utils/qrPlateGenerator.js'
import { QR_PLATE_ICONS, qrIconSvg } from '~/utils/qrPlateIcons.js'
import { decodeWhatsappQrFile } from '~/utils/qrFromImage.js'
import { downloadBlob } from '~/utils/downloadBlob.js'

definePageMeta({ layout: 'tool', toolTitle: 'QR Plate', toolFullBleed: true })

const form = reactive(structuredClone(QR_PLATE_DEFAULTS))
const result = shallowRef(null)
const generating = ref(false)
const exporting = ref(false)
const saving = ref(false)
const error = ref('')
const view = ref('3d')
const layoutMode = ref('assembly')
const previewParts = computed(() => layoutMode.value === 'print' ? result.value?.printPreviewParts : result.value?.assemblyPreviewParts)
const icons = QR_PLATE_ICONS.map((icon) => ({
  ...icon,
  src: icon.src || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrIconSvg(icon.id))}`
}))
const standStyles = [
  { id: 'none', label: 'Tanpa alas' }, { id: 'slot', label: 'Slot miring' },
  { id: 'post', label: 'Tiang lurus' }, { id: 'twist', label: 'Tiang berlekuk' }
]
const showGrid = ref(true)
const showPassword = ref(false)
const format = ref('3mf')
const whatsappPreview = ref('')
const whatsappFileName = ref('')
const whatsappReading = ref(false)
const dual = computed(() => form.plateLayout === 'wifi-whatsapp')
const layouts = [
  { id: 'single', label: 'Satu QR' },
  { id: 'wifi-whatsapp', label: 'Wi-Fi + WhatsApp' }
]
const toast = useToast()
const isAdmin = computed(() => useState('authUser').value?.role === 'admin')
const colorMode = ref('hex')
const materialIds = ref({})
const colorFields = [
  { key: 'frame', label: 'Bingkai & alas', short: 'Bingkai', materialType: 'filament' },
  { key: 'base', label: 'Panel QR terang', short: 'Panel', materialType: 'filament' },
  { key: 'detail', label: 'Pola QR gelap', short: 'QR', materialType: 'filament' },
  { key: 'icon', label: 'Ikon & tulisan', short: 'Ikon', materialType: 'filament' }
]
const dimensions = computed(() => [
  { key: 'qrSizeMm', label: dual.value ? 'Ukuran tiap QR + ruang kosong' : 'Area QR + ruang kosong', min: 25, max: 180, step: 1 },
  ...(dual.value ? [{ key: 'qrGapMm', label: 'Jarak antar QR', min: 4, max: 20, step: 1 }] : []),
  { key: 'marginMm', label: 'Margin luar pelat', min: 2, max: 12, step: 0.5 },
  { key: 'baseThicknessMm', label: 'Ketebalan dasar', min: 1.2, max: 8, step: 0.2 },
  { key: 'detailHeightMm', label: 'Ketebalan detail QR', min: 0.2, max: 2, step: 0.2 },
  { key: 'cornerRadiusMm', label: 'Radius sudut maksimum', min: 0, max: 12, step: 0.5 },
  { key: 'captionHeightMm', label: 'Tinggi tulisan maksimum', min: 3, max: 14, step: 0.5 }
])
const draft = computed(() => {
  try { return { design: createQrPlateDesign(form), error: '' } }
  catch (e) { return { design: null, error: e.message } }
})
const qrPreview = computed(() => draft.value.design ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrPlateSvg(draft.value.design))}` : '')

let controller = null, serial = 0
const state = useGeneratorState(form, result, generateModel)
const { runGenerate, ensureFreshResult, isFresh } = state

async function generateModel() {
  const token = ++serial
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  const revision = state.revision.value
  const snapshot = JSON.parse(JSON.stringify(form))
  generating.value = true
  error.value = ''
  const previous = result.value
  result.value = null
  await nextTick()
  previous?.dispose()
  if (token !== serial) return
  try {
    const output = await generateQrPlate(snapshot, { signal })
    if (token !== serial) { output.dispose(); return }
    result.value = output
    state.markGenerated(revision)
  } catch (e) {
    if (token === serial && e.name !== 'AbortError') error.value = e.message || 'Generate gagal'
  } finally { if (token === serial) generating.value = false }
}
function cancel() {
  serial++
  controller?.abort()
  state.invalidate()
  generating.value = false
}
function usePreset(mounting) {
  form.mounting = mounting === 'desk' ? 'none' : mounting
  form.standStyle = mounting === 'desk' ? 'slot' : 'none'
  const compact = dual.value || mounting === 'keyring'
  form.qrSizeMm = compact ? (dual.value ? 52 : 36) : 64
  form.captionHeightMm = mounting === 'keyring' ? 4 : 6
}
function setLayout(id) {
  form.plateLayout = id
  if (id === 'wifi-whatsapp') {
    form.contentType = 'wifi'
    if (form.qrSizeMm > 72) form.qrSizeMm = 52
    if (!form.wifiCaption) form.wifiCaption = 'Wi-Fi'
    if (!form.whatsappCaption) form.whatsappCaption = 'WhatsApp'
  }
}
async function onWhatsappFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  whatsappReading.value = true
  try {
    const decoded = await decodeWhatsappQrFile(file)
    form.whatsappPayload = decoded.payload
    whatsappPreview.value = decoded.previewUrl
    whatsappFileName.value = file.name
    if (!decoded.whatsapp) toast.info('QR terbaca, tetapi bukan tautan WhatsApp. Periksa file sebelum mencetak.')
    else toast.success('QR WhatsApp terbaca')
  } catch (e) {
    toast.error(e.message || 'Gagal membaca QR WhatsApp')
  } finally { whatsappReading.value = false }
}
function clearWhatsappQr() {
  form.whatsappPayload = ''
  whatsappPreview.value = ''
  whatsappFileName.value = ''
}
async function freshResult() {
  if (!(await ensureFreshResult())) throw new Error(error.value || 'Pengaturan berubah saat model dibuat — klik Generate lagi')
  return result.value
}
async function download() {
  if (exporting.value || saving.value) return
  exporting.value = true
  const selected = format.value
  try {
    const output = await freshResult()
    const formats = {
      '3mf': ['get3mfBlob', '3mf'], stl: ['getStlZipBlob', 'zip'], glb: ['getGlbBlob', 'glb'],
      scad: ['getScadBlob', 'scad'], svg: ['getSvgBlob', 'svg']
    }
    const [method, ext] = formats[selected]
    const blob = await output[method]()
    downloadBlob(blob, `${output.slug}.${ext}`)
    toast.success('File siap diunduh')
  } catch (e) { toast.error(e.message || 'Ekspor gagal') }
  finally { exporting.value = false }
}
async function saveToGallery() {
  if (!isAdmin.value || saving.value || exporting.value) return
  saving.value = true
  try {
    const output = await freshResult()
    const blob = output.get3mfBlob()
    const body = new FormData()
    body.append('file', new File([blob], `${output.slug}.3mf`, { type: blob.type }))
    await $fetch('/api/library-files', { method: 'POST', body, timeout: 120000, retry: 0 })
    toast.success('Pelat QR disimpan ke Galeri 3D')
  } catch (e) { toast.error(e.data?.statusMessage || e.message || 'Gagal menyimpan') }
  finally { saving.value = false }
}
onMounted(runGenerate)
onBeforeUnmount(() => {
  cancel()
  result.value?.dispose()
  result.value = null
})
</script>

<template>
  <div class="h-full overflow-y-auto p-3 sm:p-5">
    <div class="max-w-7xl mx-auto space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="p-2.5 rounded-xl bg-accent-100 text-accent-700"><QrCodeIcon class="w-6 h-6" /></div>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-semibold">QR Plate Generator</h2>
          <p class="text-sm text-ink-500">Pelat QR berbingkai — satu QR, atau Wi-Fi plus WhatsApp dari foto JPEG.</p>
        </div>
        <button v-if="generating" type="button" class="btn-secondary" @click="cancel"><StopIcon class="w-4 h-4" /> Batal</button>
        <button type="button" class="btn-primary" :disabled="generating || exporting || saving || !!draft.error" @click="runGenerate">
          <PlayIcon class="w-4 h-4" /> {{ generating ? 'Membentuk pelat…' : 'Generate 3D' }}
        </button>
      </div>

      <div class="grid lg:grid-cols-[minmax(18rem,.85fr)_minmax(0,1.4fr)] gap-4 items-start">
        <div class="space-y-3 min-w-0">
          <section class="panel p-4 space-y-3" aria-label="Konten QR">
            <div class="flex items-center justify-between gap-2"><h3 class="font-semibold">1. Konten QR</h3><span class="badge bg-emerald-50 text-emerald-700">Dibuat di perangkat</span></div>
            <div class="grid grid-cols-2 gap-2" role="group" aria-label="Jenis pelat">
              <button v-for="item in layouts" :key="item.id" type="button" class="rounded-lg border px-3 py-2 text-sm font-medium" :class="form.plateLayout === item.id ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-400' : 'border-ink-200 hover:bg-ink-50'" :aria-pressed="form.plateLayout === item.id" @click="setLayout(item.id)">{{ item.label }}</button>
            </div>
            <template v-if="dual">
              <p class="text-xs text-ink-500">Kiri: QR Wi-Fi dari nama jaringan. Kanan: unggah JPEG kartu QR dari WhatsApp; pelat mencetak ulang QR yang terbaca, tanpa logo di tengah.</p>
              <label class="block text-sm">Nama jaringan (SSID)<input v-model="form.wifiSsid" class="input mt-1" autocomplete="off" maxlength="64" /></label>
              <label class="block text-sm">Keamanan<select v-model="form.wifiSecurity" class="input mt-1"><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">Tanpa kata sandi</option></select></label>
              <label v-if="form.wifiSecurity !== 'nopass'" class="block text-sm">Kata sandi<input v-model="form.wifiPassword" :type="showPassword ? 'text' : 'password'" class="input mt-1" autocomplete="off" maxlength="128" /></label>
              <div class="flex flex-wrap gap-3 text-xs"><label><input v-model="showPassword" type="checkbox" /> Tampilkan sandi</label><label><input v-model="form.wifiHidden" type="checkbox" /> Jaringan tersembunyi</label></div>
              <div class="space-y-2">
                <span class="block text-sm">QR WhatsApp (JPEG)</span>
                <label class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-3 py-4 text-center cursor-pointer hover:bg-ink-100">
                  <PhotoIcon class="w-7 h-7 text-ink-400" />
                  <span class="text-sm">{{ whatsappReading ? 'Membaca QR…' : 'Unggah JPEG dari WhatsApp' }}</span>
                  <span class="text-xs text-ink-500">JPG, PNG, atau WebP. Kartu hijau WhatsApp atau potongan kotak QR saja sama-sama bisa.</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" class="sr-only" :disabled="whatsappReading" @change="onWhatsappFile" />
                </label>
                <div v-if="whatsappPreview" class="relative rounded-lg border border-ink-200 bg-white p-2">
                  <img :src="whatsappPreview" alt="Pratinjau kartu QR WhatsApp" class="max-h-40 mx-auto object-contain" />
                  <button type="button" class="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 border border-ink-200 text-ink-500 hover:text-red-600" title="Hapus QR WhatsApp" @click="clearWhatsappQr"><XMarkIcon class="w-4 h-4" /></button>
                  <p class="mt-2 text-[11px] text-ink-500 break-all">{{ whatsappFileName }} · {{ form.whatsappPayload }}</p>
                </div>
              </div>
            </template>
            <template v-else>
              <label class="block text-sm">Jenis konten
                <select v-model="form.contentType" class="input mt-1"><option value="url">Tautan website</option><option value="text">Teks bebas / payload QR</option><option value="wifi">Jaringan Wi-Fi</option></select>
              </label>
              <template v-if="form.contentType === 'wifi'">
                <label class="block text-sm">Nama jaringan (SSID)<input v-model="form.wifiSsid" class="input mt-1" autocomplete="off" maxlength="64" /></label>
                <label class="block text-sm">Keamanan<select v-model="form.wifiSecurity" class="input mt-1"><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">Tanpa kata sandi</option></select></label>
                <label v-if="form.wifiSecurity !== 'nopass'" class="block text-sm">Kata sandi<input v-model="form.wifiPassword" :type="showPassword ? 'text' : 'password'" class="input mt-1" autocomplete="off" maxlength="128" /></label>
                <div class="flex flex-wrap gap-3 text-xs"><label><input v-model="showPassword" type="checkbox" /> Tampilkan sandi</label><label><input v-model="form.wifiHidden" type="checkbox" /> Jaringan tersembunyi</label></div>
                <p class="text-xs text-ink-500">QR berisi akses Wi-Fi ini. Siapa pun yang memindainya dapat membaca data tersebut.</p>
              </template>
              <label v-else class="block text-sm">{{ form.contentType === 'url' ? 'Tautan tujuan' : 'Isi QR (dipertahankan persis)' }}
                <textarea v-model="form.content" rows="3" maxlength="1024" :placeholder="form.contentType === 'url' ? 'https://contoh.com' : 'Masukkan teks atau payload QR'" class="input mt-1 resize-y" spellcheck="false" />
              </label>
            </template>
            <label class="block text-sm">Koreksi error
              <select v-model="form.errorCorrection" class="input mt-1"><option value="L">L · paling ringkas</option><option value="M">M · seimbang</option><option value="Q">Q · lebih tahan kerusakan</option><option value="H">H · koreksi tertinggi</option></select>
            </label>
          </section>

          <section class="panel p-4 space-y-3" aria-label="Bentuk pelat">
            <h3 class="font-semibold">2. Bentuk & ukuran</h3>
            <div class="flex flex-wrap gap-2">
              <button v-for="preset in [{ id: 'desk', label: 'Dudukan meja' }, { id: 'none', label: 'Pelat datar' }, { id: 'keyring', label: 'Gantungan' }, { id: 'wall', label: 'Dinding' }]" :key="preset.id" type="button" class="btn-secondary text-xs" :aria-pressed="(form.standStyle !== 'none' ? 'desk' : form.mounting) === preset.id" :class="{ 'ring-2 ring-accent-400': (form.standStyle !== 'none' ? 'desk' : form.mounting) === preset.id }" @click="usePreset(preset.id)">{{ preset.label }}</button>
            </div>
            <label class="block text-sm">Permukaan<select v-model="form.surfaceMode" class="input mt-1"><option value="raised">QR timbul di atas dasar</option><option value="inlay">Inlay dua warna · permukaan rata</option></select></label>
            <div class="grid grid-cols-2 gap-3">
              <label v-for="field in dimensions" :key="field.key" class="text-xs min-w-0">{{ field.label }} (mm)
                <input v-model.number="form[field.key]" type="number" :min="field.min" :max="field.max" :step="field.step" class="input mt-1" />
              </label>
            </div>
            <label v-if="form.mounting !== 'none'" class="block text-sm">Diameter lubang (mm)<input v-model.number="form.holeDiameterMm" type="number" min="3" max="8" step="0.5" class="input mt-1" /></label>
            <p class="text-xs text-ink-500">Ruang kosong 4 modul di setiap sisi QR selalu dipertahankan. Radius sudut dibatasi margin agar tidak memotong area QR.</p>
          </section>

          <section class="panel p-4 space-y-3" aria-label="Alas dudukan meja">
            <h3 class="font-semibold">3. Base plate / dudukan meja</h3>
            <label class="block text-sm">Model dudukan
              <select v-model="form.standStyle" class="input mt-1" :disabled="form.mounting !== 'none'">
                <option v-for="style in standStyles" :key="style.id" :value="style.id">{{ style.label }}</option>
              </select>
            </label>
            <p v-if="form.mounting !== 'none'" class="text-xs text-ink-500">Pilih preset Dudukan meja untuk menambahkan alas.</p>
            <template v-if="form.standStyle !== 'none' && form.mounting === 'none'">
              <div class="grid grid-cols-2 gap-3">
                <label class="text-xs">Lebar alas (mm, 0 = otomatis)<input v-model.number="form.standWidthMm" type="number" min="0" max="220" step="1" class="input mt-1" /></label>
                <label class="text-xs">Kedalaman alas (mm)<input v-model.number="form.standDepthMm" type="number" min="28" max="90" step="1" class="input mt-1" /></label>
                <label class="text-xs">Ketebalan alas (mm)<input v-model.number="form.standThicknessMm" type="number" min="3" max="12" step="0.5" class="input mt-1" /></label>
                <label v-if="form.standStyle === 'slot'" class="text-xs">Kemiringan dari tegak (°)<input v-model.number="form.standTiltDeg" type="number" min="0" max="20" step="1" class="input mt-1" /></label>
                <label v-else class="text-xs">Tinggi tiang (mm)<input v-model.number="form.standHeightMm" type="number" min="12" max="70" step="1" class="input mt-1" /></label>
                <label class="text-xs">Kelonggaran slot total (mm)<input v-model.number="form.standClearanceMm" type="number" min="0.15" max="1" step="0.05" class="input mt-1" /></label>
              </div>
              <p class="text-xs text-ink-500">Pelat dan alas dicetak terpisah lalu disisipkan ke slot. Bagian bawah pelat disediakan khusus untuk pegangan slot. Sesuaikan kelonggaran dengan hasil kalibrasi printer.</p>
            </template>
          </section>

          <section class="panel p-4 space-y-3" aria-label="Ikon tulisan dan warna">
            <h3 class="font-semibold">4. Ikon, tulisan & warna</h3>
            <p v-if="dual" class="text-xs text-ink-500">Ikon Wi-Fi dan WhatsApp dipasang otomatis di bawah masing-masing QR.</p>
            <div v-else class="grid grid-cols-3 gap-2" role="group" aria-label="Pilihan ikon">
              <button v-for="icon in icons" :key="icon.id" type="button" class="rounded-lg border p-2 text-xs flex flex-col items-center gap-1" :class="form.iconId === icon.id ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-400' : 'border-ink-200 hover:bg-ink-50'" :aria-pressed="form.iconId === icon.id" @click="form.iconId = icon.id">
                <img :src="icon.src" alt="" class="w-7 h-7" />{{ icon.label }}
              </button>
            </div>
            <label v-if="dual || form.iconId !== 'none'" class="block text-sm">Ukuran ikon (mm)<input v-model.number="form.iconSizeMm" type="number" min="8" max="26" step="1" class="input mt-1" /></label>
            <template v-if="dual">
              <label class="block text-sm">Tulisan bawah Wi-Fi<input v-model="form.wifiCaption" maxlength="60" class="input mt-1" placeholder="Wi-Fi" /></label>
              <label class="block text-sm">Tulisan bawah WhatsApp<input v-model="form.whatsappCaption" maxlength="60" class="input mt-1" placeholder="WhatsApp" /></label>
              <KeychainFontPicker v-if="form.wifiCaption.trim() || form.whatsappCaption.trim()" v-model="form.fontUrl" :preview-text="form.wifiCaption.trim() || form.whatsappCaption" :show-downloader-link="false" />
            </template>
            <template v-else>
              <label class="block text-sm">Tulisan di bawah QR<input v-model="form.caption" maxlength="60" class="input mt-1" placeholder="Kosongkan jika tidak perlu" /></label>
              <KeychainFontPicker v-if="form.caption.trim()" v-model="form.fontUrl" :preview-text="form.caption" :show-downloader-link="false" />
            </template>
            <label class="block text-sm">Sumber warna<select v-model="colorMode" class="input mt-1"><option value="hex">Warna HEX</option><option value="material">Material filament</option></select></label>
            <ToolColorBar v-model:colors="form.colors" v-model:mode="colorMode" v-model:material-ids="materialIds" :fields="colorFields" :show-mode-switch="false" />
          </section>
        </div>

        <div class="space-y-3 min-w-0 lg:sticky lg:top-0">
          <section class="panel overflow-hidden" aria-label="Preview pelat QR">
            <div class="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-ink-200">
              <div class="flex gap-1" role="group" aria-label="Jenis preview"><button type="button" class="btn-secondary text-xs" :aria-pressed="view === '3d'" @click="view = '3d'">Model 3D</button><button type="button" class="btn-secondary text-xs" :aria-pressed="view === 'qr'" @click="view = 'qr'">Uji pindai QR</button></div>
              <div v-if="view === '3d'" class="flex gap-2 items-center">
                <select v-model="layoutMode" class="input !w-auto text-xs" aria-label="Susunan model"><option value="assembly">Terpasang</option><option value="print">Posisi cetak</option></select>
                <label class="text-xs inline-flex items-center gap-2"><input v-model="showGrid" type="checkbox" /> Grid</label>
              </div>
            </div>
            <div v-if="view === '3d'" class="qr-plate-preview" :aria-busy="generating">
              <ClientOnly>
                <KeychainPreview v-if="result" :parts="previewParts" :show-grid="showGrid" z-up-model />
                <div v-else class="h-full flex items-center justify-center text-center p-8 text-sm text-ink-500" role="status">{{ generating ? 'Membuat geometri pelat dan QR…' : 'Isi konten lalu klik Generate 3D.' }}</div>
                <template #fallback><div class="p-8 text-ink-500">Menyiapkan preview…</div></template>
              </ClientOnly>
            </div>
            <div v-else class="qr-plate-preview flex flex-col items-center justify-center p-6 bg-ink-50 gap-3">
              <img v-if="qrPreview" :src="qrPreview" alt="QR dari pengaturan saat ini, siap diuji dengan kamera" class="max-w-full object-contain rounded-lg" :class="dual ? 'w-full max-h-56' : 'w-72 aspect-square'" />
              <p class="text-xs text-ink-500 text-center">{{ dual ? 'Pindai kedua QR: kiri Wi-Fi, kanan WhatsApp.' : 'Pindai dengan kamera dan periksa tujuan QR sebelum mencetak.' }}</p>
            </div>
            <div v-if="draft.design" class="p-3 border-t border-ink-200 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
              <template v-if="draft.design.codes.length > 1">
                <span v-for="code in draft.design.codes" :key="code.id">{{ code.id === 'wifi' ? 'Wi-Fi' : 'WhatsApp' }} {{ code.size }}×{{ code.size }} · {{ code.moduleMm.toFixed(2) }} mm</span>
              </template>
              <span v-else>QR {{ draft.design.size }} × {{ draft.design.size }} modul</span>
              <span v-if="draft.design.codes.length === 1">{{ draft.design.moduleMm.toFixed(2) }} mm / modul</span>
              <span>Pelat {{ draft.design.widthMm.toFixed(1) }} × {{ draft.design.depthMm.toFixed(1) }} mm</span>
              <span v-if="draft.design.stand">Alas {{ draft.design.stand.widthMm.toFixed(1) }} × {{ draft.design.stand.depthMm }} × {{ draft.design.stand.thicknessMm }} mm</span>
            </div>
          </section>
          <p v-if="draft.error || error" class="panel p-3 bg-red-50 text-red-700 text-sm" role="alert">{{ draft.error || error }}</p>
          <p v-if="result && !isFresh" class="panel p-3 bg-amber-50 text-amber-800 text-sm" role="status">Pengaturan berubah. Preview 3D belum diperbarui; unduhan akan membuat ulang model.</p>
          <p v-for="warning in draft.design?.warnings || []" :key="warning" class="panel p-3 bg-amber-50 text-amber-800 text-sm">{{ warning }}</p>

          <section class="panel p-4 space-y-3" aria-label="Ekspor pelat QR">
            <h3 class="font-semibold">Ekspor model</h3>
            <label class="block text-sm">Nama file<input v-model="form.label" maxlength="64" class="input mt-1" /></label>
            <div class="flex flex-wrap gap-2">
              <select v-model="format" class="input !w-auto max-w-full" aria-label="Format unduhan">
                <option value="3mf">3MF · warna & alas terpisah</option><option value="stl">STL · semua bagian dalam ZIP</option><option value="glb">GLB · model terpasang</option><option value="scad">OpenSCAD · source .scad</option><option value="svg">SVG · QR 2D</option>
              </select>
              <button type="button" class="btn-primary" :disabled="generating || exporting || saving || !!draft.error" @click="download"><ArrowDownTrayIcon class="w-4 h-4" /> {{ exporting ? 'Mengekspor…' : 'Unduh' }}</button>
              <button v-if="isAdmin" type="button" class="btn-secondary" :disabled="generating || exporting || saving || !!draft.error" @click="saveToGallery"><CloudArrowUpIcon class="w-4 h-4" /> {{ saving ? 'Menyimpan…' : 'Simpan 3MF ke Galeri' }}</button>
            </div>
            <p class="text-xs text-ink-500">3MF menyusun pelat datar dan alas sebagai objek cetak terpisah. STL berisi bagian bingkai, panel, QR, ikon/tulisan, dan alas yang digunakan. Impor warna pelat sebagai satu objek multipart.</p>
            <details class="text-xs text-ink-500"><summary class="cursor-pointer text-ink-700">Tentang source OpenSCAD</summary><p class="mt-2 leading-relaxed">File .scad mandiri menyimpan QR, ikon, dan kontur tulisan model ini. Ukuran, permukaan, lubang, serta model alas dapat diubah di OpenSCAD. Untuk mengganti isi QR, ikon, atau tulisan, buat ulang melalui halaman ini.</p></details>
            <GeneratorHppPanel :result="isFresh ? result : null" :color-fields="colorFields" :material-ids="materialIds" :colors="form.colors" :color-mode="colorMode" />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-plate-preview { height: clamp(22rem, 49vh, 38rem); }
</style>
