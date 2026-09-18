<script setup>
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CloudArrowUpIcon,
  PhotoIcon,
  XMarkIcon,
  QrCodeIcon,
  PencilSquareIcon,
  ArrowsPointingInIcon,
  Square3Stack3DIcon,
  PaintBrushIcon,
  DocumentArrowDownIcon
} from '@heroicons/vue/24/outline'
import { QR_PLATE_DEFAULTS, createQrPlateDesign, qrPlateSvg } from '~/utils/qrPlateDesign.js'
import { generateQrPlate, disposeQrPlateWorker } from '~/utils/qrPlateGenerator.js'
import { QR_PLATE_ICONS, qrIconSvg } from '~/utils/qrPlateIcons.js'
import { decodeWhatsappQrFile } from '~/utils/qrFromImage.js'
import { downloadBlob } from '~/utils/downloadBlob.js'
import { libraryUploadForm } from '~/utils/modelFilename.js'
import { useUiLayout } from '~/composables/useUiLayout.js'
import { useToolColorMode } from '~/composables/useToolColorMode.js'
import ToolColorBar from '~/components/ToolColorBar.vue'
import ToolPanelShell from '~/components/ToolPanelShell.vue'

definePageMeta({ layout: 'tool', toolTitle: 'QR Plate', toolFullBleed: true })

const { layoutConfig, deviceLabel, modeLabel } = useUiLayout()
const { mode: colorMode } = useToolColorMode()

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
const { includePrintProfile, printExportOptions } = useSlicerProfile('qr-plate')
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
  { key: 'captionHeightMm', label: 'Tinggi tulisan bawah', min: 3, max: 14, step: 0.5 },
  { key: 'captionStrokeMm', label: 'Tebal tulisan bawah', min: 0, max: 1.5, step: 0.1 },
  ...(form.businessName.trim() ? [{ key: 'businessNameHeightMm', label: 'Tinggi nama usaha', min: 3, max: 14, step: 0.5 }] : [])
])
const needsFont = computed(() =>
  !!(form.caption.trim() || form.wifiCaption.trim() || form.whatsappCaption.trim() || form.businessName.trim())
)
const fontPreview = computed(() =>
  form.businessName.trim() || form.caption.trim() || form.wifiCaption.trim() || form.whatsappCaption || 'Abc'
)
const draft = computed(() => {
  try { return { design: createQrPlateDesign(form), error: '' } }
  catch (e) { return { design: null, error: e.message } }
})
const qrPreview = computed(() => draft.value.design ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrPlateSvg(draft.value.design))}` : '')

const activeToolPanel = ref('design')
const TOOL_PANELS = [
  { id: 'design', label: 'Konten', icon: markRaw(QrCodeIcon) },
  { id: 'size', label: 'Ukuran', icon: markRaw(ArrowsPointingInIcon) },
  { id: 'stand', label: 'Alas', icon: markRaw(Square3Stack3DIcon) },
  { id: 'header', label: 'Tulisan', icon: markRaw(PencilSquareIcon) },
  { id: 'colors', label: 'Warna', icon: markRaw(PaintBrushIcon) },
  { id: 'export', label: 'Export', icon: markRaw(DocumentArrowDownIcon), needsResult: true }
]
const toolPanels = TOOL_PANELS
const activePanelMeta = computed(
  () => toolPanels.find((p) => p.id === activeToolPanel.value) || toolPanels[0]
)

function selectToolPanel(id) {
  const panel = toolPanels.find((p) => p.id === id)
  if (panel?.needsResult && !result.value) {
    toast.info('Generate model dulu untuk membuka Export')
    return
  }
  activeToolPanel.value = id
}

let controller = null, serial = 0
const state = useGeneratorState(form, result, generateModel)
const { runGenerate, ensureFreshResult, isFresh } = state
const previewWarnings = computed(() => [...new Set([
  ...(draft.value.design?.warnings || []),
  ...(isFresh.value ? result.value?.warnings || [] : [])
])])

const previewKey = ref(0)

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
  const snapshot = JSON.parse(JSON.stringify(form))
  try {
    const output = await generateQrPlate(snapshot, { signal })
    if (token !== serial) { output.dispose(); return }
    result.value = output
    previewKey.value += 1
    state.markGenerated(revision)
  } catch (e) {
    if (token === serial && e.name !== 'AbortError') error.value = e.message || 'Generate gagal'
  } finally { if (token === serial) generating.value = false }
}

let textTimer
watch(
  () => [
    form.plateLayout, form.contentType, form.content, form.caption,
    form.wifiCaption, form.whatsappCaption, form.wifiSsid, form.wifiPassword,
    form.wifiSecurity, form.wifiHidden, form.whatsappPayload, form.fontUrl,
    form.errorCorrection, form.businessName, form.headerLogoSvg,
    form.businessNameHeightMm, form.headerLogoSizeMm, form.headerLogoGapMm,
    form.headerLogoStrokeMm, form.captionStrokeMm
  ],
  () => {
    clearTimeout(textTimer)
    textTimer = setTimeout(() => {
      if (!draft.value.error) runGenerate()
    }, 450)
  }
)
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
function fileSlug(label) {
  return String(label || 'QR Plate').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'qr_plate'
}

async function download() {
  if (exporting.value || saving.value) return
  exporting.value = true
  const selected = format.value
  try {
    if (selected === 'svg') {
      if (!draft.value.design) throw new Error(draft.value.error || 'Pengaturan belum valid')
      downloadBlob(new Blob([qrPlateSvg(draft.value.design)], { type: 'image/svg+xml' }), `${fileSlug(form.label)}.svg`)
      toast.success('File siap diunduh')
      return
    }
    const output = await freshResult()
    const formats = {
      '3mf': ['get3mfBlob', '3mf'], stl: ['getStlZipBlob', 'zip'], glb: ['getGlbBlob', 'glb'],
      scad: ['getScadBlob', 'scad']
    }
    const [method, ext] = formats[selected]
    const blob = await (selected === '3mf' ? output[method](printExportOptions.value) : output[method]())
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
    const blob = output.get3mfBlob(printExportOptions.value)
    await $fetch('/api/library-files', { method: 'POST', body: libraryUploadForm(blob, `${output.slug}.3mf`, blob.type), timeout: 120000, retry: 0 })
    toast.success('Pelat QR disimpan ke Galeri 3D')
  } catch (e) { toast.error(e.data?.statusMessage || e.message || 'Gagal menyimpan') }
  finally { saving.value = false }
}
onMounted(runGenerate)
onBeforeUnmount(() => {
  clearTimeout(textTimer)
  cancel()
  disposeQrPlateWorker()
  result.value?.dispose()
  result.value = null
})
</script>

<template>
  <div class="h-full flex flex-col p-2 sm:p-3 min-h-0">
    <div class="panel overflow-hidden flex flex-1 min-h-0" :class="layoutConfig.editorClass">
      <ToolPanelShell
        :panels="toolPanels"
        :active-panel="activeToolPanel"
        :active-panel-meta="activePanelMeta"
        :generating="generating"
        :result="result"
        @select="selectToolPanel"
        @generate="runGenerate"
      >
        <template v-if="activeToolPanel === 'design'">
          <InfoTooltip label="Informasi qr-plate">Dibuat di perangkat. Satu QR, atau Wi-Fi plus WhatsApp dari foto JPEG.</InfoTooltip>
          <div class="grid grid-cols-2 gap-2" role="group" aria-label="Jenis pelat">
            <button
              v-for="item in layouts"
              :key="item.id"
              type="button"
              class="rounded-lg border px-3 py-2 text-sm font-medium"
              :class="form.plateLayout === item.id ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-400' : 'border-ink-200 hover:bg-ink-50'"
              :aria-pressed="form.plateLayout === item.id"
              @click="setLayout(item.id)"
            >{{ item.label }}</button>
          </div>
          <template v-if="dual">
            <InfoTooltip label="Informasi qr-plate">Kiri: QR Wi-Fi. Kanan: unggah JPEG kartu QR WhatsApp.</InfoTooltip>
            <KeychainCompactField label="Nama jaringan (SSID)" unit="">
              <input v-model="form.wifiSsid" class="input text-sm" autocomplete="off" maxlength="64" />
            </KeychainCompactField>
            <KeychainCompactField label="Keamanan" unit="">
              <select v-model="form.wifiSecurity" class="input text-sm">
                <option value="WPA">WPA / WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Tanpa kata sandi</option>
              </select>
            </KeychainCompactField>
            <KeychainCompactField v-if="form.wifiSecurity !== 'nopass'" label="Kata sandi" unit="">
              <input v-model="form.wifiPassword" :type="showPassword ? 'text' : 'password'" class="input text-sm" autocomplete="off" maxlength="128" />
            </KeychainCompactField>
            <div class="flex flex-wrap gap-3 text-xs">
              <label><input v-model="showPassword" type="checkbox" /> Tampilkan sandi</label>
              <label><input v-model="form.wifiHidden" type="checkbox" /> Jaringan tersembunyi</label>
            </div>
            <div class="space-y-2">
              <span class="block text-xs text-ink-600">QR WhatsApp (JPEG)</span>
              <label class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-3 py-4 text-center cursor-pointer hover:bg-ink-100">
                <PhotoIcon class="w-7 h-7 text-ink-400" />
                <span class="text-sm">{{ whatsappReading ? 'Membaca QR…' : 'Unggah JPEG dari WhatsApp' }}</span>
                <span class="text-[10px] text-ink-400">JPG, PNG, atau WebP.</span>
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
            <KeychainCompactField label="Jenis konten" unit="">
              <select v-model="form.contentType" class="input text-sm">
                <option value="url">Tautan website</option>
                <option value="text">Teks bebas / payload QR</option>
                <option value="wifi">Jaringan Wi-Fi</option>
              </select>
            </KeychainCompactField>
            <template v-if="form.contentType === 'wifi'">
              <KeychainCompactField label="Nama jaringan (SSID)" unit="">
                <input v-model="form.wifiSsid" class="input text-sm" autocomplete="off" maxlength="64" />
              </KeychainCompactField>
              <KeychainCompactField label="Keamanan" unit="">
                <select v-model="form.wifiSecurity" class="input text-sm">
                  <option value="WPA">WPA / WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Tanpa kata sandi</option>
                </select>
              </KeychainCompactField>
              <KeychainCompactField v-if="form.wifiSecurity !== 'nopass'" label="Kata sandi" unit="">
                <input v-model="form.wifiPassword" :type="showPassword ? 'text' : 'password'" class="input text-sm" autocomplete="off" maxlength="128" />
              </KeychainCompactField>
              <div class="flex flex-wrap gap-3 text-xs">
                <label><input v-model="showPassword" type="checkbox" /> Tampilkan sandi</label>
                <label><input v-model="form.wifiHidden" type="checkbox" /> Jaringan tersembunyi</label>
              </div>
              <p class="text-[10px] text-ink-400">QR berisi akses Wi-Fi ini. Siapa pun yang memindainya dapat membaca data tersebut.</p>
            </template>
            <KeychainCompactField v-else :label="form.contentType === 'url' ? 'Tautan tujuan' : 'Isi QR'" unit="">
              <textarea v-model="form.content" rows="3" maxlength="1024" :placeholder="form.contentType === 'url' ? 'https://contoh.com' : 'Masukkan teks atau payload QR'" class="input text-sm resize-y" spellcheck="false" />
            </KeychainCompactField>
          </template>
          <KeychainCompactField label="Koreksi error" unit="">
            <select v-model="form.errorCorrection" class="input text-sm">
              <option value="L">L · paling ringkas</option>
              <option value="M">M · seimbang</option>
              <option value="Q">Q · lebih tahan kerusakan</option>
              <option value="H">H · koreksi tertinggi</option>
            </select>
          </KeychainCompactField>
        </template>

        <template v-else-if="activeToolPanel === 'size'">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="preset in [{ id: 'desk', label: 'Dudukan meja' }, { id: 'none', label: 'Pelat datar' }, { id: 'keyring', label: 'Gantungan' }, { id: 'wall', label: 'Dinding' }]"
              :key="preset.id"
              type="button"
              class="btn-secondary text-xs"
              :aria-pressed="(form.standStyle !== 'none' ? 'desk' : form.mounting) === preset.id"
              :class="{ 'ring-2 ring-accent-400': (form.standStyle !== 'none' ? 'desk' : form.mounting) === preset.id }"
              @click="usePreset(preset.id)"
            >{{ preset.label }}</button>
          </div>
          <KeychainCompactField label="Permukaan" unit="">
            <select v-model="form.surfaceMode" class="input text-sm">
              <option value="raised">QR timbul di atas dasar</option>
              <option value="inlay">Inlay dua warna · permukaan rata</option>
            </select>
          </KeychainCompactField>
          <div class="grid grid-cols-2 gap-2">
            <KeychainCompactField v-for="field in dimensions" :key="field.key" :label="field.label">
              <input v-model.number="form[field.key]" type="number" :min="field.min" :max="field.max" :step="field.step" class="input-num w-full text-sm" />
            </KeychainCompactField>
          </div>
          <KeychainCompactField v-if="form.mounting !== 'none'" label="Diameter lubang">
            <input v-model.number="form.holeDiameterMm" type="number" min="3" max="8" step="0.5" class="input-num w-full text-sm" />
          </KeychainCompactField>
          <InfoTooltip label="Informasi qr-plate">
            Ruang kosong 4 modul di setiap sisi QR selalu dipertahankan. Radius sudut dibatasi margin agar tidak memotong area QR.
          </InfoTooltip>
        </template>

        <template v-else-if="activeToolPanel === 'stand'">
          <KeychainCompactField label="Model dudukan" unit="">
            <select v-model="form.standStyle" class="input text-sm" :disabled="form.mounting !== 'none'">
              <option v-for="style in standStyles" :key="style.id" :value="style.id">{{ style.label }}</option>
            </select>
          </KeychainCompactField>
          <p v-if="form.mounting !== 'none'" class="text-[10px] text-ink-400">Pilih preset Dudukan meja di tab Ukuran untuk menambahkan alas.</p>
          <template v-if="form.standStyle !== 'none' && form.mounting === 'none'">
            <div class="grid grid-cols-2 gap-2">
              <KeychainCompactField label="Lebar alas" hint="0 = otomatis">
                <input v-model.number="form.standWidthMm" type="number" min="0" max="220" step="1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Kedalaman alas">
                <input v-model.number="form.standDepthMm" type="number" min="28" max="90" step="1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Ketebalan alas">
                <input v-model.number="form.standThicknessMm" type="number" min="3" max="12" step="0.5" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField v-if="form.standStyle === 'slot'" label="Kemiringan" unit="°">
                <input v-model.number="form.standTiltDeg" type="number" min="0" max="20" step="1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField v-else label="Tinggi tiang">
                <input v-model.number="form.standHeightMm" type="number" min="12" max="70" step="1" class="input-num w-full text-sm" />
              </KeychainCompactField>
              <KeychainCompactField label="Kelonggaran slot">
                <input v-model.number="form.standClearanceMm" type="number" min="0.15" max="1" step="0.05" class="input-num w-full text-sm" />
              </KeychainCompactField>
            </div>
            <InfoTooltip label="Informasi qr-plate">
              Pelat dan alas dicetak terpisah lalu disisipkan ke slot. Sesuaikan kelonggaran dengan hasil kalibrasi printer.
            </InfoTooltip>
          </template>
        </template>

        <template v-else-if="activeToolPanel === 'header'">
          <KeychainCompactField label="Nama usaha (atas pelat)" unit="">
            <input v-model="form.businessName" maxlength="60" class="input text-sm" placeholder="Kosongkan jika tidak perlu" />
          </KeychainCompactField>
          <KeychainSvgUpload
            v-model:svg-content="form.headerLogoSvg"
            v-model:svg-size-mm="form.headerLogoSizeMm"
            v-model:svg-gap-mm="form.headerLogoGapMm"
            v-model:svg-stroke-mm="form.headerLogoStrokeMm"
            label="Logo usaha (atas pelat)"
            hint="Di atas QR"
            size-label="Ukuran logo"
            stroke-label="Tambahan ketebalan garis"
            :size-min="8"
            :size-max="36"
            :show-gap="!!form.businessName.trim()"
            show-stroke
          />
          <InfoTooltip label="Informasi qr-plate">Logo dan nama usaha muncul di atas QR. Quiet zone QR tetap kosong.</InfoTooltip>
          <p v-if="form.headerLogoSvg" class="text-[10px] text-ink-400">Ketebalan tambahan 0 mempertahankan bentuk SVG.</p>
          <p v-if="dual" class="text-[10px] text-ink-400">Ikon Wi-Fi dan WhatsApp dipasang otomatis di bawah masing-masing QR.</p>
          <div v-else class="grid grid-cols-3 gap-2" role="group" aria-label="Pilihan ikon">
            <button
              v-for="icon in icons"
              :key="icon.id"
              type="button"
              class="rounded-lg border p-2 text-xs flex flex-col items-center gap-1"
              :class="form.iconId === icon.id ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-400' : 'border-ink-200 hover:bg-ink-50'"
              :aria-pressed="form.iconId === icon.id"
              @click="form.iconId = icon.id"
            >
              <img :src="icon.src" alt="" class="w-7 h-7" />{{ icon.label }}
            </button>
          </div>
          <KeychainCompactField v-if="dual || form.iconId !== 'none'" label="Ukuran ikon">
            <input v-model.number="form.iconSizeMm" type="number" min="8" max="26" step="1" class="input-num w-full text-sm" />
          </KeychainCompactField>
          <template v-if="dual">
            <KeychainCompactField label="Tulisan bawah Wi-Fi" unit="">
              <input v-model="form.wifiCaption" maxlength="60" class="input text-sm" placeholder="Wi-Fi" />
            </KeychainCompactField>
            <KeychainCompactField label="Tulisan bawah WhatsApp" unit="">
              <input v-model="form.whatsappCaption" maxlength="60" class="input text-sm" placeholder="WhatsApp" />
            </KeychainCompactField>
          </template>
          <KeychainCompactField v-else label="Tulisan di bawah QR" unit="">
            <input v-model="form.caption" maxlength="60" class="input text-sm" placeholder="Kosongkan jika tidak perlu" />
          </KeychainCompactField>
          <KeychainCompactField v-if="needsFont" label="Tebal tulisan bawah" hint="Naikkan agar huruf lebih tebal di cetakan.">
            <div class="flex items-center gap-2">
              <input v-model.number="form.captionStrokeMm" type="range" min="0" max="1.5" step="0.1" class="flex-1" />
              <span class="text-xs font-mono text-ink-700 w-12 text-right">{{ form.captionStrokeMm }}</span>
            </div>
          </KeychainCompactField>
          <KeychainFontPicker v-if="needsFont" v-model="form.fontUrl" :preview-text="fontPreview" :show-downloader-link="false" />
        </template>

        <template v-else-if="activeToolPanel === 'colors'">
          <InfoTooltip label="Informasi qr-plate">Warna bagian mengikuti material di katalog.</InfoTooltip>
          <ToolColorBar
            v-model:colors="form.colors"
            v-model:mode="colorMode"
            v-model:material-ids="materialIds"
            :fields="colorFields"
            variant="list"
            @change="runGenerate"
          />
        </template>

        <template v-else-if="activeToolPanel === 'export'">
          <template v-if="result">
            <KeychainCompactField label="Nama file" unit="">
              <input v-model="form.label" maxlength="64" class="input text-sm" />
            </KeychainCompactField>
            <KeychainCompactField label="Format" unit="">
              <select v-model="format" class="input text-sm">
                <option value="3mf">3MF · proyek OrcaSlicer</option>
                <option value="stl">STL · semua bagian dalam ZIP</option>
                <option value="glb">GLB · model terpasang</option>
                <option value="scad">OpenSCAD · source .scad</option>
                <option value="svg">SVG · QR 2D</option>
              </select>
            </KeychainCompactField>
            <SlicerProfileSettings v-if="format === '3mf'" v-model="includePrintProfile" tool="qr-plate" />
            <div class="space-y-2">
              <button type="button" class="btn-primary w-full text-sm" :disabled="generating || exporting || saving || !!draft.error" @click="download">
                <ArrowDownTrayIcon class="w-4 h-4" /> {{ exporting ? 'Mengekspor…' : 'Unduh' }}
              </button>
              <button v-if="isAdmin" type="button" class="btn-secondary w-full text-sm" :disabled="generating || exporting || saving || !!draft.error" @click="saveToGallery">
                <CloudArrowUpIcon class="w-4 h-4" /> {{ saving ? 'Menyimpan…' : 'Simpan 3MF ke Galeri' }}
              </button>
            </div>
            <InfoTooltip label="Informasi qr-plate">
              3MF menyusun pelat datar dan alas sebagai objek cetak terpisah. Impor warna pelat sebagai satu objek multipart.
            </InfoTooltip>
            <details class="text-xs text-ink-500">
              <summary class="cursor-pointer text-ink-700">Tentang source OpenSCAD</summary>
              <p class="mt-2 leading-relaxed">File .scad mandiri menyimpan QR, ikon, dan kontur tulisan model ini. Ukuran, permukaan, lubang, serta model alas dapat diubah di OpenSCAD.</p>
            </details>
            <GeneratorSliceHpp
              :result="isFresh ? result : null"
              tool="qr-plate"
              :model-name="form.label"
              :print-options="printExportOptions"
              :color-fields="colorFields"
              :material-ids="materialIds"
              :colors="form.colors"
              :color-mode="colorMode"
            />
          </template>
          <p v-else class="text-xs text-ink-500 text-center py-8">Generate model dulu untuk export.</p>
        </template>
      </ToolPanelShell>

      <div :class="[layoutConfig.previewOrder, layoutConfig.previewClass]">
        <div class="sticky top-0 z-10 shrink-0 border-b border-ink-200 bg-white/95 backdrop-blur-sm shadow-sm px-3 py-2 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex gap-1" role="group" aria-label="Jenis preview">
              <button type="button" class="btn-secondary text-xs" :aria-pressed="view === '3d'" @click="view = '3d'">Model 3D</button>
              <button type="button" class="btn-secondary text-xs" :aria-pressed="view === 'qr'" @click="view = 'qr'">Uji pindai QR</button>
            </div>
            <div v-if="view === '3d'" class="flex gap-2 items-center">
              <select v-model="layoutMode" class="input !w-auto text-xs" aria-label="Susunan model">
                <option value="assembly">Terpasang</option>
                <option value="print">Posisi cetak</option>
              </select>
              <label class="text-xs inline-flex items-center gap-2"><input v-model="showGrid" type="checkbox" /> Grid</label>
            </div>
          </div>
          <div v-if="draft.design" class="hidden lg:flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-ink-500">
            <template v-if="draft.design.codes.length > 1">
              <span v-for="code in draft.design.codes" :key="code.id">{{ code.id === 'wifi' ? 'Wi-Fi' : 'WhatsApp' }} {{ code.size }}×{{ code.size }}</span>
            </template>
            <span v-else>QR {{ draft.design.size }}×{{ draft.design.size }}</span>
            <span>Pelat {{ draft.design.widthMm.toFixed(1) }}×{{ draft.design.depthMm.toFixed(1) }} mm</span>
            <span v-if="draft.design.stand">Alas {{ draft.design.stand.widthMm.toFixed(1) }}×{{ draft.design.stand.depthMm }} mm</span>
          </div>
          <p v-if="result" class="text-[10px] text-ink-400">{{ deviceLabel }} · mode {{ modeLabel }}</p>
          <p v-if="draft.error || error" class="text-[10px] text-red-600">{{ draft.error || error }}</p>
          <p v-if="result && !isFresh" class="text-[10px] text-amber-700">Teks atau pengaturan berubah. Model 3D sedang dibuat ulang.</p>
          <p v-for="warning in previewWarnings" :key="warning" class="text-[10px] text-amber-700">{{ warning }}</p>
        </div>

        <div
          class="relative flex-1 min-h-[18rem] sm:min-h-[24rem] bg-gradient-to-b from-ink-50 to-ink-100/80 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:24px_24px]"
        >
          <ClientOnly>
            <template v-if="view === 'qr'">
              <div class="absolute inset-0 flex flex-col items-center justify-center p-6 bg-ink-50 gap-3">
                <img v-if="qrPreview" :src="qrPreview" alt="QR dari pengaturan saat ini, siap diuji dengan kamera" class="max-w-full object-contain rounded-lg" :class="dual ? 'w-full max-h-56' : 'w-72 aspect-square'" />
                <p class="text-xs text-ink-500 text-center">{{ dual ? 'Pindai kedua QR: kiri Wi-Fi, kanan WhatsApp.' : 'Pindai dengan kamera dan periksa tujuan QR sebelum mencetak.' }}</p>
              </div>
            </template>
            <template v-else-if="result">
              <KeychainPreview
                :key="previewKey"
                :parts="previewParts"
                :show-grid="showGrid"
                z-up-model
                class="absolute inset-0 h-full w-full"
              />
            </template>
            <div
              v-else-if="generating"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-ink-500"
            >
              <ArrowPathIcon class="w-6 h-6 animate-spin text-accent-500" />
              Membuat geometri pelat dan QR…
              <button type="button" class="btn-secondary text-xs" @click="cancel">Batal</button>
            </div>
            <div
              v-else
              class="absolute inset-0 flex items-center justify-center text-xs text-ink-400 px-4 text-center"
            >
              Atur konten QR · klik Generate
            </div>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
