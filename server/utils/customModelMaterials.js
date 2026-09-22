import { eq, inArray } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { inspectCustom3mf } from './custom3mf.js'
import { validateStl } from './stl.js'
import { parseMaterialColor } from './materialColor.js'
const invalid = (message) => Object.assign(new Error(message), { statusCode: 400, statusMessage: message })
export function inspectCustomModel(bytes, format, selectedPlates = null) {
  if (format === '3mf') return inspectCustom3mf(bytes, selectedPlates)
  if (selectedPlates != null) throw invalid('Pilihan plate hanya berlaku untuk file 3MF')
  validateStl(bytes)
  return { format: 'stl', colors: ['#ffffff'], hasDefinedColors: false, maxColors: 1 }
}
export async function loadFilaments(db, ids) {
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw invalid('Pilih material untuk setiap warna model')
  const rows = await db.select({ id: schema.materials.id, name: schema.materials.name, color: schema.materials.color, type: schema.materials.type, unit: schema.materials.unit, stockQuantity: schema.materials.stockQuantity, pricePerUnit: schema.materials.pricePerUnit, filamentTypeName: schema.filamentTypes.name })
    .from(schema.materials).leftJoin(schema.filamentTypes, eq(schema.materials.filamentTypeId, schema.filamentTypes.id)).where(inArray(schema.materials.id, ids))
  if (ids.some((id) => !rows.some((m) => m.id === id && m.type === 'filament' && m.unit === 'gram' && (!m.filamentTypeName || /^PLA/i.test(m.filamentTypeName))))) throw invalid('Material harus filament PLA dalam gram sesuai profil Orca')
  return rows
}
export async function resolveCustomMaterials(db, inspection, selections) {
  if (!Array.isArray(selections) || selections.length !== inspection.colors.length) throw invalid('Pilih material untuk setiap warna model')
  const sourceMaterialIds = selections.map(Number), materialIds = [...new Set(sourceMaterialIds)]
  if (materialIds.length > inspection.maxColors) throw invalid(`Maksimal ${inspection.maxColors} material sekaligus; gabungkan warna atau sesuaikan model`)
  const materials = await loadFilaments(db, materialIds)
  if (materials.some((m) => m.stockQuantity <= 0)) throw invalid('Material yang dipilih kehabisan stok')
  return { sourceColors: inspection.colors, sourceMaterialIds, materialIds, slotMap: sourceMaterialIds.map((id) => materialIds.indexOf(id)), colors: materialIds.map((id) => parseMaterialColor(materials.find((m) => m.id === id).color)), ...(inspection.format === '3mf' ? {
    selectedPlates: inspection.selectedPlates || [inspection.selectedPlate],
    plateNames: inspection.plateNames || [inspection.plateName],
    ...(inspection.selectedPlate ? { selectedPlate: inspection.selectedPlate, plateName: inspection.plateName } : {})
  } : {}) }
}
