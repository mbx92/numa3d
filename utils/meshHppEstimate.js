export const DEFAULT_FILAMENT_DENSITY = 1.24
export const DEFAULT_INFILL_PERCENT = 20
export const DEFAULT_WASTE_PERCENT = 5

const ROLE_FIELD = {
  base: 'base',
  lid: 'lid',
  text: 'text',
  letter: 'letter',
  accent: 'accent',
  plate: 'plate',
  plateInner: 'plate',
  plateOuter: 'plate',
  rim: 'baseHighlight',
  cavityWall: 'cavityWall',
  bottomCap: 'baseBottom',
  frame: 'frame',
  back: 'back',
  stand: 'frame',
  background: 'background',
  color: 'text',
  diffuser: 'text'
}

function hexNorm(hex) {
  const s = String(hex || '').trim().toLowerCase()
  if (!s) return ''
  return s[0] === '#' ? s : `#${s}`
}

export function geometryVolumeMm3(geometry) {
  const pos = geometry?.attributes?.position
  if (!pos?.count) return 0
  const arr = pos.array
  const index = geometry.index?.array
  let sum = 0
  const tri = (ia, ib, ic) => {
    const ax = arr[ia], ay = arr[ia + 1], az = arr[ia + 2]
    const bx = arr[ib], by = arr[ib + 1], bz = arr[ib + 2]
    const cx = arr[ic], cy = arr[ic + 1], cz = arr[ic + 2]
    sum += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)
  }
  if (index) {
    for (let i = 0; i + 2 < index.length; i += 3) {
      tri(index[i] * 3, index[i + 1] * 3, index[i + 2] * 3)
    }
  } else {
    for (let i = 0; i + 8 < arr.length; i += 9) {
      tri(i, i + 3, i + 6)
    }
  }
  return Math.abs(sum) / 6
}

export function gramsFromVolumeMm3(
  volumeMm3,
  { density = DEFAULT_FILAMENT_DENSITY, infillPercent = DEFAULT_INFILL_PERCENT, wastePercent = DEFAULT_WASTE_PERCENT } = {}
) {
  const vol = Math.max(Number(volumeMm3) || 0, 0)
  const dens = Math.max(Number(density) || 0, 0)
  const infill = Math.min(Math.max(Number(infillPercent) || 0, 0), 100) / 100
  const waste = Math.max(Number(wastePercent) || 0, 0) / 100
  return (vol / 1000) * dens * infill * (1 + waste)
}

export function collectGeneratorExportParts(result) {
  if (!result) return []
  const keys = [
    'baseExportParts',
    'lidExportParts',
    'accentExportParts',
    'textExportParts',
    'faceExportParts',
    'bodyExportParts',
    'standExportParts'
  ]
  const seen = new Set()
  const out = []
  for (const key of keys) {
    for (const part of result[key] || []) {
      const geo = part?.geometry
      if (!geo || seen.has(geo)) continue
      seen.add(geo)
      out.push(part)
    }
  }
  return out
}

export function fieldKeyForPart(part, colorFields = [], colors = {}) {
  const role = part?.role || part?.name
  const fromRole = ROLE_FIELD[role]
  if (fromRole && colorFields.some((f) => f.key === fromRole)) return fromRole
  if (colorFields.some((f) => f.key === role)) return role
  const partHex = hexNorm(part?.color)
  if (partHex) {
    const match = colorFields.find((f) => hexNorm(colors[f.key]) === partHex)
    if (match) return match.key
  }
  return null
}

export function estimateMaterialLines(
  parts,
  {
    colorFields = [],
    materialIds = {},
    colors = {},
    materials = [],
    density = DEFAULT_FILAMENT_DENSITY,
    infillPercent = DEFAULT_INFILL_PERCENT,
    wastePercent = DEFAULT_WASTE_PERCENT,
    switchMaterialId = null
  } = {}
) {
  const byId = new Map((materials || []).map((m) => [Number(m.id), m]))
  const gramsByMaterial = new Map()
  const skipped = []

  for (const part of parts || []) {
    if (!part || part.line || part.previewOnly || part.role === 'switch') continue
    const fieldKey = fieldKeyForPart(part, colorFields, colors)
    const materialId = fieldKey ? Number(materialIds[fieldKey]) : NaN
    if (!Number.isInteger(materialId) || materialId <= 0) {
      skipped.push(partLabel(part, fieldKey))
      continue
    }
    const volume = geometryVolumeMm3(part.geometry)
    const grams = gramsFromVolumeMm3(volume, { density, infillPercent, wastePercent })
    const prev = gramsByMaterial.get(materialId) || { volumeMm3: 0, grams: 0 }
    gramsByMaterial.set(materialId, {
      volumeMm3: prev.volumeMm3 + volume,
      grams: prev.grams + grams
    })
  }

  const lines = [...gramsByMaterial.entries()]
    .map(([materialId, agg]) => {
      const material = byId.get(materialId) || null
      const quantityUsed = Math.round(agg.grams * 10) / 10
      return {
        materialId,
        materialName: material?.name || `Material #${materialId}`,
        unit: material?.unit || 'gram',
        type: material?.type || 'filament',
        quantityUsed,
        volumeMm3: Math.round(agg.volumeMm3),
        material
      }
    })
    .filter((l) => l.quantityUsed > 0)
    .sort((a, b) => a.materialName.localeCompare(b.materialName))

  const switchId = Number(switchMaterialId)
  if (Number.isInteger(switchId) && switchId > 0) {
    const material = byId.get(switchId)
    if (material && !lines.some((l) => l.materialId === switchId)) {
      lines.push({
        materialId: switchId,
        materialName: material.name,
        unit: material.unit || 'pcs',
        type: material.type || 'part',
        quantityUsed: 1,
        volumeMm3: 0,
        material,
        isSwitchPart: true
      })
    }
  }

  return { lines, skipped: [...new Set(skipped)] }
}

function partLabel(part, fieldKey) {
  return fieldKey || part?.role || part?.name || 'part'
}

export function mergeGeneratorRecipe({ existingRecipes = [], existingPackaging = [], estimateLines = [], materials = [], machineId = null }) {
  const byId = new Map((materials || []).map((m) => [Number(m.id), m]))
  const keepParts = (existingRecipes || []).filter((r) => byId.get(Number(r.materialId))?.type === 'part')
  const oldPrint = (existingRecipes || []).find((r) => byId.get(Number(r.materialId))?.type !== 'part') || existingRecipes?.[0]
  const printTimeMinutes = Math.round(Number(oldPrint?.printTimeMinutes) || 0)
  const laborMinutes = Math.round(Number(oldPrint?.laborMinutes) || 0)
  const laborRatePerHour = Math.round(Number(oldPrint?.laborRatePerHour) || 0)
  const failureRatePercent = Number(oldPrint?.failureRatePercent) >= 0 ? Number(oldPrint.failureRatePercent) : 5
  const resolvedMachine = machineId != null && machineId !== '' ? Number(machineId) : oldPrint?.machineId || null

  const filament = (estimateLines || []).filter((l) => l.type !== 'part')
  const extraParts = (estimateLines || []).filter((l) => l.type === 'part')
  const keepPartIds = new Set(keepParts.map((r) => Number(r.materialId)))

  const recipes = [
    ...filament.map((line, i) => ({
      materialId: line.materialId,
      quantityUsed: line.quantityUsed,
      printTimeMinutes: i === 0 ? printTimeMinutes : 0,
      machineId: i === 0 && resolvedMachine ? Number(resolvedMachine) : null,
      failureRatePercent,
      laborMinutes: i === 0 ? laborMinutes : 0,
      laborRatePerHour: i === 0 ? laborRatePerHour : 0
    })),
    ...keepParts.map((r) => ({
      materialId: r.materialId,
      quantityUsed: r.quantityUsed,
      printTimeMinutes: r.printTimeMinutes || 0,
      machineId: r.machineId || null,
      failureRatePercent: r.failureRatePercent ?? 5,
      laborMinutes: r.laborMinutes || 0,
      laborRatePerHour: r.laborRatePerHour || 0
    })),
    ...extraParts
      .filter((l) => !keepPartIds.has(l.materialId))
      .map((line) => ({
        materialId: line.materialId,
        quantityUsed: line.quantityUsed,
        printTimeMinutes: 0,
        machineId: null,
        failureRatePercent: 0,
        laborMinutes: 0,
        laborRatePerHour: 0
      }))
  ]

  return {
    recipes,
    packaging: (existingPackaging || []).map((p) => ({
      packagingId: p.packagingId,
      quantityUsed: p.quantityUsed
    }))
  }
}
