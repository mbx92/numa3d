import { access, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

const MAX_BYTES = 40 * 1024 * 1024
const ARCHIVE_FILES = new Set(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/model_settings.config', 'Metadata/project_settings.config'])
const OBJECT_KEYS = new Set(['name', 'extruder', 'plater_id', 'plater_name', 'locked', 'object_id', 'instance_id', 'identify_id'])
const WIN_ORCA = 'C:/Program Files/OrcaSlicer/orca-slicer.exe'
const MAC_ORCA = '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer'
const MAC_PROFILES = '/Applications/OrcaSlicer.app/Contents/Resources/profiles/Anycubic'
const MACHINE_PRESET = 'Anycubic Kobra X 0.4 nozzle'
let active = false
let slicerModsPromise

function loadSlicerModules() {
  if (!slicerModsPromise) {
    const dir = join(process.cwd(), 'utils')
    slicerModsPromise = Promise.all([
      import(pathToFileURL(join(dir, 'slicerProjectSettings.js')).href),
      import(pathToFileURL(join(dir, 'slicerHpp.js')).href)
    ]).then(([project, hpp]) => ({
      TOOL_PRINT_PROFILES: project.TOOL_PRINT_PROFILES,
      slicerProjectSettings: project.slicerProjectSettings,
      parseOrcaGcodeStats: hpp.parseOrcaGcodeStats,
      computeSlicerHpp: hpp.computeSlicerHpp
    }))
  }
  return slicerModsPromise
}

export async function computeSlicerHpp(stats, costs) {
  return (await loadSlicerModules()).computeSlicerHpp(stats, costs)
}

export function resolveOrcaInstall({ executable = process.env.ORCA_SLICER_PATH, profilesPath = process.env.ORCA_PROFILES_PATH } = {}) {
  const resolvedExecutable = executable
    || (process.platform === 'darwin' ? MAC_ORCA : '')
    || (process.platform === 'win32' ? WIN_ORCA : '')
  const resolvedProfiles = profilesPath
    || (process.platform === 'darwin' ? MAC_PROFILES : '')
    || (resolvedExecutable ? join(dirname(resolvedExecutable), 'resources', 'profiles', 'Anycubic') : '')
  return { executable: resolvedExecutable, profilesPath: resolvedProfiles }
}

export async function orcaSlicerStatus(options) {
  const { executable, profilesPath } = resolveOrcaInstall(options)
  if (!executable) return { ready: false, message: 'OrcaSlicer belum dikonfigurasi pada server ini' }
  try { await access(executable) } catch { return { ready: false, message: 'OrcaSlicer tidak ditemukan pada server ini' } }
  try { await access(join(profilesPath, 'machine', `${MACHINE_PRESET}.json`)) }
  catch { return { ready: false, message: 'Profil Anycubic Kobra X tidak ditemukan pada server ini' } }
  return { ready: true, message: 'OrcaSlicer siap di server ini' }
}

export async function prepareSlicerInput(bytes, tool, includeProfile = true) {
  const { TOOL_PRINT_PROFILES, slicerProjectSettings } = await loadSlicerModules()
  const profile = TOOL_PRINT_PROFILES[tool]
  if (!profile) throw new Error('Generator tidak didukung untuk slicing')
  if (!bytes?.length || bytes.length > MAX_BYTES) throw new Error('Ukuran 3MF maksimal 40 MB')
  let expanded = 0
  const archive = unzipSync(bytes, { filter(entry) {
    expanded += entry.originalSize
    if (!ARCHIVE_FILES.has(entry.name) || expanded > 100 * 1024 * 1024) throw new Error('Gunakan 3MF langsung dari generator Numa3D')
    return true
  } })
  if ([...ARCHIVE_FILES].some((name) => !archive[name])) throw new Error('Proyek 3MF generator tidak lengkap')
  let xml = strFromU8(archive['3D/3dmodel.model'])
  if (/<!|\b(?:path|href)\s*=/i.test(xml) || !xml.includes('<mesh>')) throw new Error('Model harus berisi mesh lokal')
  xml = xml.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata\s*>|<metadata\b[^>]*\/>/gi, '')
  const modelTags = new Set(['model', 'resources', 'object', 'mesh', 'vertices', 'vertex', 'triangles', 'triangle', 'basematerials', 'base', 'components', 'component', 'build', 'item'])
  for (const tag of xml.matchAll(/<\/?([\w:.-]+)/g)) if (!modelTags.has(tag[1])) throw new Error('Elemen model tidak didukung')
  xml = xml.replace(/(<model\b[^>]*>)/, '$1<metadata name="Application">Numa3D</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="OrcaSlicer">2.3.2</metadata>')
  archive['3D/3dmodel.model'] = strToU8(xml)
  const objects = strFromU8(archive['Metadata/model_settings.config'])
  if (/<!/.test(objects)) throw new Error('Metadata objek tidak valid')
  // Accept only the object/part/plate metadata written by our exporter, never executable settings.
  for (const tag of objects.matchAll(/<\/?([\w:.-]+)([^>]*)>/g)) {
    if (!['config', 'object', 'part', 'metadata', 'plate', 'model_instance'].includes(tag[1])) throw new Error('Metadata objek tidak didukung')
    for (const attr of tag[2].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
      if (!['id', 'subtype', 'key', 'value'].includes(attr[1])) throw new Error('Atribut objek tidak didukung')
      if (attr[1] === 'key' && !OBJECT_KEYS.has(attr[2])) throw new Error('Pengaturan objek tidak didukung')
    }
    if (/'|\b(?:key|value)\s*=\s*[^"\s]/.test(tag[2])) throw new Error('Format metadata objek tidak didukung')
  }
  const incoming = JSON.parse(strFromU8(archive['Metadata/project_settings.config']))
  const colors = incoming.filament_colour
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > 4 || colors.some((color) => !/^#[\da-f]{6}$/i.test(color))) throw new Error('Slicing Kobra X mendukung 1–4 warna pada konfigurasi ini')
  const settings = {
    name: 'project_settings', version: '2.3.2.0',
    printer_settings_id: 'Anycubic Kobra X 0.4 nozzle', printer_model: 'Anycubic Kobra X', nozzle_diameter: ['0.4'],
    printable_area: ['0x0', '260x0', '260x260', '0x260'], printable_height: '260',
    filament_colour: colors, print_settings_id: '', filament_settings_id: colors.map(() => ''),
    ...slicerProjectSettings(includeProfile ? profile.id : null, colors.length)
  }
  archive['Metadata/project_settings.config'] = strToU8(JSON.stringify(settings))
  // Relationships and content types are fixed, independent of uploaded references.
  archive['_rels/.rels'] = strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
  archive['[Content_Types].xml'] = strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/></Types>')
  return { bytes: zipSync(archive), settings }
}

async function loadPreset(root, type, name, seen = new Set()) {
  if (!name || /[\\/]/.test(name) || seen.has(name) || seen.size > 8) throw new Error('Referensi profil OrcaSlicer tidak valid')
  seen.add(name)
  const value = JSON.parse(await readFile(join(root, type, `${name}.json`), 'utf8'))
  const full = { ...(value.inherits ? await loadPreset(root, type, value.inherits, seen) : {}), ...value }
  delete full.inherits
  return full
}

function runOrca(executable, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = '', timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 180000)
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { log = (log + chunk.toString()).slice(-12000) })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return reject(new Error('Slicing melebihi batas 3 menit'))
      if (code !== 0) return reject(new Error(`OrcaSlicer gagal melakukan slicing (kode ${code}). ${log.slice(-800)}`))
      resolveRun()
    })
  })
}

export async function sliceGenerator3mf(bytes, { tool, includeProfile = true, executable, profilesPath } = {}) {
  if (active) throw Object.assign(new Error('OrcaSlicer sedang memproses model lain. Coba lagi setelah selesai.'), { statusCode: 409 })
  const install = resolveOrcaInstall({ executable, profilesPath })
  executable = install.executable
  profilesPath = install.profilesPath
  if (!executable) throw new Error('OrcaSlicer belum dikonfigurasi pada server ini')
  try { await access(executable) } catch { throw new Error('OrcaSlicer tidak ditemukan pada server ini') }
  if (active) throw Object.assign(new Error('OrcaSlicer sedang memproses model lain. Coba lagi setelah selesai.'), { statusCode: 409 })
  const input = await prepareSlicerInput(bytes, tool, includeProfile)
  active = true
  let directory
  try {
    directory = await mkdtemp(join(tmpdir(), 'numa3d-slice-'))
    const { TOOL_PRINT_PROFILES, parseOrcaGcodeStats } = await loadSlicerModules()
    const profiles = profilesPath
    const machine = await loadPreset(profiles, 'machine', 'Anycubic Kobra X 0.4 nozzle')
    const processPreset = await loadPreset(profiles, 'process', '0.16mm High Quality @Anycubic Kobra X 0.4 nozzle')
    const filament = await loadPreset(profiles, 'filament', 'Anycubic PLA @Anycubic Kobra X 0.4 nozzle')
    // Installed Kobra X preset has 0 although the CLI accepts only 10–18 for this optional field.
    if (machine.retraction_distances_when_cut?.every((value) => Number(value) === 0)) delete machine.retraction_distances_when_cut
    // Apply the same process keys that are embedded in the 3MF, so CLI and File > Open share one process.
    const skipProcess = new Set(['name', 'version', 'printer_settings_id', 'printer_model', 'nozzle_diameter', 'printable_area', 'printable_height', 'filament_colour'])
    for (const [key, value] of Object.entries(input.settings)) {
      if (!skipProcess.has(key)) processPreset[key] = value
    }
    if (includeProfile) processPreset.name = processPreset.print_settings_id = input.settings.print_settings_id
    processPreset.post_process = []
    const machinePath = join(directory, 'machine.json'), processPath = join(directory, 'process.json'), filamentPath = join(directory, 'filament.json')
    await writeFile(machinePath, JSON.stringify(machine))
    await writeFile(processPath, JSON.stringify(processPreset))
    await writeFile(filamentPath, JSON.stringify(filament))
    await writeFile(join(directory, 'input.3mf'), input.bytes)
    const args = ['--datadir', join(directory, 'orca-data'), '--outputdir', directory,
      '--load-settings', `${machinePath};${processPath}`, '--load-filaments', input.settings.filament_colour.map(() => filamentPath).join(';'),
      '--curr-bed-type', 'Textured PEI Plate', ...(input.settings.filament_colour.length > 1 ? ['--enable-prime-tower'] : []),
      '--arrange', '0', '--orient', '0', '--slice', '0', '--export-3mf', 'sliced.3mf', join(directory, 'input.3mf')]
    await runOrca(executable, args, directory)
    const gcode = await readFile(join(directory, 'plate_1.gcode'), 'utf8')
    const stats = parseOrcaGcodeStats(gcode)
    if (stats.filamentGrams.length !== input.settings.filament_colour.length) throw new Error('Slot filament hasil slicing tidak cocok dengan model')
    return { ...stats, tool, colors: input.settings.filament_colour, profile: includeProfile ? TOOL_PRINT_PROFILES[tool].label : 'Kobra X 0.16mm High Quality', bed: 'Textured PEI Plate' }
  } finally {
    active = false
    if (directory) {
      const target = resolve(directory), boundary = relative(resolve(tmpdir()), target)
      if (boundary && !boundary.startsWith('..') && !isAbsolute(boundary)) await rm(target, { recursive: true, force: true }).catch(() => {})
    }
  }
}
