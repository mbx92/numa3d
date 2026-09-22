import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inspectCustom3mf, prepareCustom3mf } from './custom3mf.js'

export const MAX_PROFILE_3MF_BYTES = 40 * 1024 * 1024
export const PROFILE_3MF_ID = 'qr-plate-pla-0.4'

let slicerSettingsPromise
function loadSlicerSettings() {
  if (!slicerSettingsPromise) {
    slicerSettingsPromise = import(pathToFileURL(join(process.cwd(), 'utils', 'slicerProjectSettings.js')).href)
  }
  return slicerSettingsPromise
}

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })

function cleanSourceFilename(filename) {
  const cleaned = String(filename || 'model.3mf').replace(/[\u0000-\u001f\u007f\\/]/g, '_').trim()
  if (!/\.3mf$/i.test(cleaned)) throw invalid('Pilih file dengan format .3mf')
  return cleaned.slice(0, 180)
}

function outputFilename(filename) {
  const stem = cleanSourceFilename(filename).replace(/\.3mf$/i, '').slice(0, 120) || 'model'
  return `${stem}_Anycubic-Kobra-X_QR-Detail.3mf`
}

function validateBytes(bytes) {
  if (!bytes?.length) throw invalid('File 3MF wajib dipilih')
  if (bytes.length > MAX_PROFILE_3MF_BYTES) throw invalid('Ukuran file 3MF maksimal 40 MB')
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw invalid('Format file 3MF tidak valid')
  }
}

function profileSummary() {
  return {
    id: PROFILE_3MF_ID,
    label: 'QR Plate Detail',
    printer: 'Anycubic Kobra X 0.4 nozzle',
    material: 'PLA',
    bed: 'Textured PEI Plate',
    layerHeight: 0.12,
    wallLoops: 2,
    infill: '15%',
    outerWallSpeed: 40,
    topSurfaceSpeed: 30,
    support: false
  }
}

export function inspectProfile3mf(bytes, filename) {
  validateBytes(bytes)
  const sourceFilename = cleanSourceFilename(filename)
  const model = inspectCustom3mf(bytes)
  const issues = []
  if (model.colors.length > model.maxColors) {
    issues.push(`Model memakai ${model.colors.length} warna aktif; profil ini mendukung maksimal ${model.maxColors} warna`)
  }
  return {
    sourceFilename,
    outputFilename: outputFilename(sourceFilename),
    sizeBytes: bytes.length,
    compatible: issues.length === 0,
    issues,
    model,
    profile: profileSummary()
  }
}

export async function convertProfile3mf(bytes, filename, inputConfig = null) {
  const inspection = inspectProfile3mf(bytes, filename)
  if (!inspection.compatible) throw invalid(inspection.issues[0])
  const colors = inspection.model.colors
  const prepared = prepareCustom3mf(bytes, inputConfig || {
    sourceColors: colors,
    colors,
    slotMap: colors.map((_, index) => index)
  })
  const archive = unzipSync(prepared.bytes)
  const settingsPath = 'Metadata/project_settings.config'
  let settings
  try { settings = JSON.parse(strFromU8(archive[settingsPath])) }
  catch { throw invalid('Metadata proyek hasil konversi tidak valid') }
  const { slicerProjectSettings } = await loadSlicerSettings()
  const filamentCount = prepared.settings.filament_colour.length
  Object.assign(settings, slicerProjectSettings(PROFILE_3MF_ID, filamentCount), {
    name: 'project_settings',
    version: '2.3.2.0',
    printer_settings_id: 'Anycubic Kobra X 0.4 nozzle',
    printer_model: 'Anycubic Kobra X',
    nozzle_diameter: ['0.4'],
    printable_area: ['0x0', '260x0', '260x260', '0x260'],
    printable_height: '260',
    post_process: []
  })
  archive[settingsPath] = strToU8(JSON.stringify(settings))
  return {
    bytes: Buffer.from(zipSync(archive, { level: 6 })),
    filename: inspection.outputFilename,
    inspection,
    settings
  }
}
