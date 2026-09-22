import { posix } from 'node:path'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { Matrix4, Vector3 } from 'three'
import { validateStl } from './stl.js'
import { mapFilamentPainting, filamentPaintingForSlot } from './filamentPainting.js'

const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })
const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value]
const MAX_3MF_EXPANDED_BYTES = 200 * 1024 * 1024
const MAX_3MF_STL_BYTES = 128 * 1024 * 1024
const MAX_TRIANGLES = Math.floor((MAX_3MF_STL_BYTES - 84) / 50)
const UNITS = { micron: 0.001, millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8 }

// Read geometry and filament assignments, then rebuild a clean Orca project.
// Uploaded profiles, G-code and post-processing never reach Orca.
export function custom3mfToStl(bytes, { project = false, inspect = false, inputConfig = null, selectedPlate = null } = {}) {
  if (!bytes?.length || bytes.length > 40 * 1024 * 1024) throw invalid('Ukuran 3MF maksimal 40 MB')
  let expanded = 0, entries = 0, archive
  try {
    archive = unzipSync(bytes, { filter(entry) {
      expanded += entry.originalSize
      if (++entries > 1024) throw invalid('Arsip 3MF memiliki terlalu banyak berkas')
      if (expanded > MAX_3MF_EXPANDED_BYTES) throw invalid(`Isi 3MF menjadi sekitar ${Math.ceil(expanded / 1024 / 1024)} MB setelah diekstrak; batasnya 200 MB.`)
      return /\.model$/i.test(entry.name) || ['_rels/.rels', 'Metadata/model_settings.config', 'Metadata/project_settings.config', 'Metadata/Slic3r_PE_model.config', 'Metadata/Slic3r_PE.config', 'Metadata/slicer_config.json'].includes(entry.name)
    } })
  } catch (error) {
    throw error.statusCode ? error : invalid('Format file 3MF tidak valid')
  }
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, processEntities: false })
  const xml = (path) => {
    if (!archive[path]) throw invalid('Referensi model 3MF tidak ditemukan di dalam file')
    const text = strFromU8(archive[path])
    if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw invalid('XML model 3MF tidak valid')
    try { return parser.parse(text) } catch { throw invalid('XML model 3MF tidak valid') }
  }
  const internalPath = (target, current = '') => {
    if (typeof target !== 'string' || !target || /[\\?#\u0000-\u001f]|^[a-z][a-z\d+.-]*:/i.test(target)) throw invalid('3MF harus memakai referensi model lokal')
    const path = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(current), target))
    if (path === '..' || path.startsWith('../') || !archive[path]) throw invalid('Referensi model 3MF tidak ditemukan di dalam file')
    return path
  }
  const relationships = list(xml('_rels/.rels')?.Relationships?.Relationship)
  const relation = relationships.find((item) => /\/3dmodel$/.test(item['@_Type'] || ''))
  if (!relation || relation['@_TargetMode'] === 'External') throw invalid('3MF harus berisi model lokal')
  const rootPath = internalPath(relation['@_Target'])
  const palette = [], usedSlots = new Set(), configs = new Map()
  let plateMetadata = []
  let hasDefinedColors = false
  const color = (value) => {
    if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value || '')) throw invalid('Warna filament 3MF tidak valid')
    return value.slice(0, 7).toLowerCase()
  }
  for (const name of ['Metadata/project_settings.config', 'Metadata/slicer_config.json']) {
    if (!archive[name]) continue
    let settings
    try { settings = JSON.parse(strFromU8(archive[name])) } catch { throw invalid('Metadata palet 3MF tidak valid') }
    const colors = settings.filament_colour || settings.filament_color
    if (colors != null) {
      if (!Array.isArray(colors) || !colors.length || colors.length > 64) throw invalid('Palet warna 3MF tidak valid')
      if (!palette.length) palette.push(...colors.map(color))
      hasDefinedColors = true
    }
  }
  if (!palette.length && archive['Metadata/Slic3r_PE.config']) {
    const colors = strFromU8(archive['Metadata/Slic3r_PE.config']).match(/^;?\s*filament_colour\s*=\s*(.+)$/m)?.[1]
    if (colors) { palette.push(...colors.trim().split(';').map(color)); hasDefinedColors = true }
  }
  const slotForColor = (value) => {
    const hex = color(value)
    hasDefinedColors = true
    let index = palette.indexOf(hex)
    if (index < 0) { index = palette.length; palette.push(hex) }
    if (palette.length > 64) throw invalid('3MF memiliki terlalu banyak warna')
    return index
  }
  const ensureSlot = (slot) => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 64) throw invalid('Slot filament 3MF tidak valid')
    while (palette.length <= slot) palette.push('#ffffff')
    return slot
  }
  const extruder = (metadata) => {
    const raw = list(metadata).find((item) => item['@_key'] === 'extruder')?.['@_value']
    return raw == null || raw === '0' ? null : ensureSlot(Number(raw) - 1)
  }
  for (const name of ['Metadata/model_settings.config', 'Metadata/Slic3r_PE_model.config']) {
    if (!archive[name]) continue
    const config = xml(name)?.config
    if (list(config?.plate).length && !plateMetadata.length) plateMetadata = list(config.plate)
    for (const object of list(config?.object)) {
      const parts = new Map()
      for (const part of list(object.part)) {
        if (part['@_subtype'] && part['@_subtype'] !== 'normal_part') throw invalid('3MF dengan modifier atau negative part belum didukung')
        parts.set(String(part['@_id']), extruder(part.metadata))
      }
      if (list(object.volume).length) throw invalid('3MF dengan pembagian volume Prusa perlu diekspor sebagai 3MF Orca')
      configs.set(String(object['@_id']), { slot: extruder(object.metadata), parts })
    }
  }
  const metadataValue = (entries, key) => list(entries).find((entry) => entry['@_key'] === key)?.['@_value']
  const plates = plateMetadata.length ? plateMetadata.map((plate, index) => {
    const rawId = metadataValue(plate.metadata, 'plater_id') ?? String(index + 1)
    const plateId = Number(rawId)
    if (!Number.isSafeInteger(plateId) || plateId <= 0) throw invalid('ID plate 3MF tidak valid')
    const name = String(metadataValue(plate.metadata, 'plater_name') || '').trim().slice(0, 120)
    const references = list(plate.model_instance).map((instance) => {
      const objectId = metadataValue(instance.metadata, 'object_id')
      const instanceId = metadataValue(instance.metadata, 'instance_id')
      if (!/^\d+$/.test(String(objectId)) || !/^\d+$/.test(String(instanceId))) throw invalid('Referensi instance plate 3MF tidak valid')
      return `${Number(objectId)}:${Number(instanceId)}`
    })
    return { id: plateId, name, references }
  }) : [{ id: 1, name: '', references: [] }]
  if (new Set(plates.map((plate) => plate.id)).size !== plates.length) throw invalid('ID plate 3MF berulang')
  const requestedPlate = selectedPlate ?? inputConfig?.selectedPlate ?? plates[0].id
  if (!Number.isSafeInteger(requestedPlate) || !plates.some((plate) => plate.id === requestedPlate)) throw invalid('Plate 3MF yang dipilih tidak tersedia')
  const plate = plates.find((entry) => entry.id === requestedPlate)
  const assignments = new Map()
  if (plates.length > 1 || plate.references.length) {
    for (const entry of plates) for (const reference of entry.references) {
      if (assignments.has(reference)) throw invalid('Instance 3MF terdaftar pada lebih dari satu plate')
      assignments.set(reference, entry.id)
    }
    if (!assignments.size) throw invalid('3MF multi-plate tidak memiliki daftar objek per plate')
  }
  const models = new Map()
  const id = (value) => {
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw invalid('ID objek 3MF tidak valid')
    return String(Number(value))
  }
  const model = (path) => {
    if (models.has(path)) return models.get(path)
    const doc = xml(path)?.model
    const scale = UNITS[doc?.['@_unit'] || 'millimeter']
    if (!doc || !scale || !doc.resources) throw invalid('Model atau satuan 3MF tidak didukung')
    const objects = new Map()
    for (const object of list(doc.resources.object)) {
      const key = id(object['@_id'])
      if (objects.has(key)) throw invalid('ID objek 3MF berulang')
      objects.set(key, object)
    }
    const properties = new Map()
    for (const group of list(doc.resources.basematerials)) properties.set(id(group['@_id']), list(group.base).map((base) => base['@_displaycolor']))
    for (const group of list(doc.resources.colorgroup)) properties.set(id(group['@_id']), list(group.color).map((entry) => entry['@_color']))
    const result = { doc, scale, objects, properties }
    models.set(path, result)
    return result
  }
  const transform = (value, scale) => {
    if (value == null) return new Matrix4()
    const a = String(value).trim().split(/\s+/).map(Number)
    if (a.length !== 12 || a.some((n) => !Number.isFinite(n))) throw invalid('Transformasi 3MF tidak valid')
    return new Matrix4().set(a[0], a[3], a[6], a[9] * scale, a[1], a[4], a[7], a[10] * scale, a[2], a[5], a[8], a[11] * scale, 0, 0, 0, 1)
  }
  const root = model(rootPath)
  const instances = []
  let triangles = 0, visits = 0
  const propertySlot = (source, pid, index) => {
    const values = source.properties.get(id(pid))
    if (!values || !/^\d+$/.test(String(index)) || !values[Number(index)]) throw invalid('Referensi warna 3MF tidak didukung atau tidak valid')
    return slotForColor(values[Number(index)])
  }
  const visit = (path, objectId, matrix, stack = new Set(), config = null, inheritedSlot = null) => {
    const key = `${path}:${id(objectId)}`
    if (++visits > 10000 || stack.size >= 32 || stack.has(key)) throw invalid('Susunan objek 3MF terlalu kompleks atau berulang')
    const source = model(path), object = source.objects.get(id(objectId))
    if (!object) throw invalid('Objek 3MF tidak ditemukan')
    if (object['@_type'] && !['model', 'other'].includes(object['@_type'])) throw invalid('Tipe objek 3MF tidak didukung')
    if (object.mesh) {
      if (object.components) throw invalid('Struktur objek 3MF tidak valid')
      const vertices = list(object.mesh.vertices?.vertex), faces = list(object.mesh.triangles?.triangle)
      triangles += faces.length
      if (!vertices.length || !faces.length) throw invalid('Mesh 3MF kosong')
      if (triangles > MAX_TRIANGLES) throw invalid(`Mesh 3MF memiliki ${triangles.toLocaleString('id-ID')} segitiga; batasnya ${MAX_TRIANGLES.toLocaleString('id-ID')}. Sederhanakan mesh lalu ekspor ulang.`)
      const assigned = inheritedSlot ?? config?.slot
      const defaultSlot = assigned != null ? assigned : object['@_pid'] != null ? propertySlot(source, object['@_pid'], object['@_pindex'] ?? '0') : ensureSlot(0)
      const faceColors = faces.map((face) => {
        const paint = face['@_paint_color'] || face['@_mmu_segmentation']
        if (paint) {
          for (const state of mapFilamentPainting(paint).states) usedSlots.add(state ? ensureSlot(state - 1) : defaultSlot)
          return { paint }
        }
        let slot = defaultSlot
        if (face['@_p1'] != null) {
          if (['p2', 'p3'].some((key) => face[`@_${key}`] != null && face[`@_${key}`] !== face['@_p1'])) throw invalid('Warna gradien per vertex 3MF belum didukung; gunakan warna per bagian atau painting Orca')
          slot = propertySlot(source, face['@_pid'] ?? object['@_pid'], face['@_p1'])
        }
        usedSlots.add(slot)
        return { slot }
      })
      instances.push({ vertices, faces, faceColors, defaultSlot, matrix, scale: source.scale })
    } else {
      const children = list(object.components?.component)
      if (!children.length) throw invalid('3MF harus berisi mesh atau komponen model')
      const next = new Set(stack).add(key)
      for (const child of children) {
        const childPath = child['@_path'] ? internalPath(child['@_path'], path) : path
        const childSlot = config?.parts.get(String(child['@_objectid'])) ?? inheritedSlot ?? config?.slot ?? null
        visit(childPath, child['@_objectid'], matrix.clone().multiply(transform(child['@_transform'], source.scale)), next, config, childSlot)
      }
    }
  }
  const instanceCounts = new Map(), buildItems = list(root.doc.build?.item)
  for (const item of buildItems) {
    const objectId = id(item['@_objectid'])
    const instanceId = instanceCounts.get(objectId) || 0
    instanceCounts.set(objectId, instanceId + 1)
    if (['0', 'false'].includes(item['@_printable'])) continue
    if (assignments.size) {
      const assignedPlate = assignments.get(`${objectId}:${instanceId}`)
      if (assignedPlate == null) throw invalid('Objek 3MF tidak memiliki plate yang jelas')
      if (assignedPlate !== requestedPlate) continue
    }
    const path = item['@_path'] ? internalPath(item['@_path'], rootPath) : rootPath
    const config = configs.get(objectId) || null
    visit(path, objectId, transform(item['@_transform'], root.scale), new Set(), config, config?.slot ?? null)
  }
  if (!triangles) {
    if (inspect) return {
      format: '3mf', colors: [], hasDefinedColors, maxColors: 4,
      triangles: 0, size: [0, 0, 0], objects: 0, empty: true,
      plates: plates.map(({ id, name }) => ({ id, name })), selectedPlate: requestedPlate,
      plateName: plate.name
    }
    throw invalid('Plate 3MF yang dipilih tidak memiliki model yang dapat dicetak')
  }
  const output = Buffer.alloc(84 + triangles * 50)
  output.write('Numa3D single-color 3MF geometry')
  output.writeUInt32LE(triangles, 80)
  let offset = 84
  const point = new Vector3(), normal = new Vector3()
  for (const instance of instances) {
    const mirrored = instance.matrix.determinant() < 0
    const vertices = instance.vertices.map((vertex) => {
      const coords = ['x', 'y', 'z'].map((axis) => {
        const raw = vertex[`@_${axis}`]
        if (raw == null || String(raw).trim() === '' || !Number.isFinite(Number(raw))) throw invalid('Koordinat 3MF tidak valid')
        return Number(raw) * instance.scale
      })
      return point.fromArray(coords).applyMatrix4(instance.matrix).clone()
    })
    for (const face of instance.faces) {
      const indices = ['v1', 'v2', 'v3'].map((key) => {
        const raw = face[`@_${key}`], index = Number(raw)
        if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(index) || !vertices[index]) throw invalid('Indeks segitiga 3MF tidak valid')
        return index
      })
      if (mirrored) [indices[1], indices[2]] = [indices[2], indices[1]]
      const points = indices.map((index) => vertices[index])
      normal.subVectors(points[1], points[0]).cross(point.subVectors(points[2], points[0])).normalize()
      for (const [i, vector] of [normal, ...points].entries()) {
        for (let axis = 0; axis < 3; axis++) output.writeFloatLE(vector.getComponent(axis), offset + i * 12 + axis * 4)
      }
      offset += 50
    }
  }
  const geometry = validateStl(output, { maxBytes: MAX_3MF_STL_BYTES })
  const originalSlots = [...usedSlots].sort((a, b) => a - b)
  const sourceColors = originalSlots.map((slot) => palette[slot])
  if (inspect) return {
    format: '3mf', colors: sourceColors, hasDefinedColors, maxColors: 4,
    triangles: geometry.triangles, size: geometry.size, objects: instances.length,
    plates: plates.map(({ id, name }) => ({ id, name })), selectedPlate: requestedPlate,
    plateName: plate.name
  }
  if (project) {
    const colors = inputConfig?.colors || sourceColors
    const slots = inputConfig?.slotMap || sourceColors.map((_, index) => index)
    if (!colors.length || colors.length > 4 || slots.length !== sourceColors.length || slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= colors.length)) throw invalid('Pilih maksimal empat material untuk warna 3MF')
    if (inputConfig?.sourceColors && JSON.stringify(inputConfig.sourceColors) !== JSON.stringify(sourceColors)) throw invalid('Palet 3MF berubah, periksa pemetaan material kembali')
    const remap = palette.map((_, index) => {
      const position = originalSlots.indexOf(index)
      return position >= 0 ? slots[position] : 0
    })
    const meshObjects = [], parts = [], components = []
    for (const [index, instance] of instances.entries()) {
      const objectId = index + 1
      const vertices = instance.vertices.map((v) => `<vertex x="${Number(v['@_x']) * instance.scale}" y="${Number(v['@_y']) * instance.scale}" z="${Number(v['@_z']) * instance.scale}"/>`).join('')
      const faces = instance.faces.map((face, i) => {
        const entry = instance.faceColors[i]
        const paint = entry.paint ? mapFilamentPainting(entry.paint, remap).text : filamentPaintingForSlot(remap[entry.slot])
        return `<triangle v1="${Number(face['@_v1'])}" v2="${Number(face['@_v2'])}" v3="${Number(face['@_v3'])}" paint_color="${paint}"/>`
      }).join('')
      meshObjects.push(`<object id="${objectId}" type="model"><mesh><vertices>${vertices}</vertices><triangles>${faces}</triangles></mesh></object>`)
      const matrix = instance.matrix.elements
      components.push(`<component objectid="${objectId}" transform="${[0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14].map((i) => matrix[i]).join(' ')}"/>`)
      parts.push(`<part id="${objectId}" subtype="normal_part"><metadata key="extruder" value="${remap[instance.defaultSlot] + 1}"/></part>`)
    }
    const assemblyId = instances.length + 1
    const settings = {
      name: 'project_settings', version: '2.3.2.0', print_settings_id: '', printer_settings_id: 'Anycubic Kobra X 0.4 nozzle', printer_model: 'Anycubic Kobra X', nozzle_diameter: ['0.4'],
      printable_area: ['0x0', '260x0', '260x260', '0x260'], printable_height: '260', filament_colour: colors.map(color),
      filament_settings_id: colors.map(() => ''), flush_volumes_matrix: colors.flatMap((_, from) => colors.map((_, to) => from === to ? '0' : '70')), flush_multiplier: '1', enable_prime_tower: colors.length > 1 ? '1' : '0', post_process: []
    }
    const clean = {
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/></Types>'),
      '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
      '3D/3dmodel.model': strToU8(`<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Numa3D</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="OrcaSlicer">2.3.2</metadata><resources>${meshObjects.join('')}<object id="${assemblyId}" type="model"><components>${components.join('')}</components></object></resources><build><item objectid="${assemblyId}"/></build></model>`),
      'Metadata/model_settings.config': strToU8(`<config><object id="${assemblyId}"><metadata key="extruder" value="1"/>${parts.join('')}</object><plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="${assemblyId}"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="1"/></model_instance></plate></config>`),
      'Metadata/project_settings.config': strToU8(JSON.stringify(settings))
    }
    return { bytes: zipSync(clean), format: '3mf', settings, sourceColors, selectedPlate: requestedPlate, plateName: plate.name }
  }
  return output
}

export function inspectCustom3mf(bytes, selectedPlates = null) {
  if (selectedPlates == null || !Array.isArray(selectedPlates)) return custom3mfToStl(bytes, { inspect: true, selectedPlate: selectedPlates })
  if (!selectedPlates.length || selectedPlates.length > 16 || selectedPlates.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(selectedPlates).size !== selectedPlates.length) {
    throw invalid('Pilih 1–16 plate 3MF tanpa duplikat')
  }
  const details = selectedPlates.map((id) => custom3mfToStl(bytes, { inspect: true, selectedPlate: id }))
  const colors = [...new Set(details.flatMap((detail) => detail.colors))]
  return {
    format: '3mf', colors, hasDefinedColors: details.some((detail) => detail.hasDefinedColors), maxColors: 4,
    triangles: details.reduce((sum, detail) => sum + detail.triangles, 0),
    objects: details.reduce((sum, detail) => sum + detail.objects, 0),
    size: [0, 1, 2].map((axis) => Math.max(...details.map((detail) => detail.size[axis]))),
    plates: details[0].plates, selectedPlates,
    plateNames: details.map((detail) => detail.plateName),
    emptyPlates: details.filter((detail) => detail.empty).map((detail) => detail.selectedPlate)
  }
}
export function prepareCustom3mf(bytes, inputConfig) { return custom3mfToStl(bytes, { project: true, inputConfig }) }
