import { DEFAULT_MATERIAL_COLOR, materialSwatchColor } from './materialColor.js'

function matchesFieldType(material, field) {
  return !field?.materialType || material?.type === field.materialType
}

function randomItem(items, random) {
  const draw = Number(random())
  const normalized = Number.isFinite(draw) ? Math.min(0.999999, Math.max(0, draw)) : 0
  return items[Math.floor(normalized * items.length)]
}

/**
 * Isi field generator yang belum memiliki material. Material dan warna yang
 * sudah dipilih pengguna selalu dipertahankan.
 */
export function fillMissingToolMaterials({
  fields = [],
  materialIds = {},
  colors = {},
  materials = [],
  random = Math.random
} = {}) {
  const nextMaterialIds = { ...(materialIds || {}) }
  const nextColors = { ...(colors || {}) }
  const byId = new Map((materials || []).map((material) => [Number(material.id), material]))
  const usedIds = new Set()
  const usedColors = new Set()

  for (const field of fields || []) {
    const material = byId.get(Number(nextMaterialIds[field.key]))
    if (!material || !matchesFieldType(material, field)) continue
    usedIds.add(Number(material.id))
    const hex = materialSwatchColor(material)
    if (hex) usedColors.add(hex)
  }

  let changed = false
  for (const field of fields || []) {
    const current = byId.get(Number(nextMaterialIds[field.key]))
    if (current && matchesFieldType(current, field)) continue

    const matching = (materials || []).filter((material) => matchesFieldType(material, field))
    if (!matching.length) continue
    const colored = matching.filter((material) => materialSwatchColor(material))
    const pool = colored.length ? colored : matching
    const unusedColor = pool.filter((material) => {
      const hex = materialSwatchColor(material)
      return !usedIds.has(Number(material.id)) && (!hex || !usedColors.has(hex))
    })
    const unusedMaterial = pool.filter((material) => !usedIds.has(Number(material.id)))
    const material = randomItem(unusedColor.length ? unusedColor : unusedMaterial.length ? unusedMaterial : pool, random)
    const hex = materialSwatchColor(material) || DEFAULT_MATERIAL_COLOR

    nextMaterialIds[field.key] = Number(material.id)
    nextColors[field.key] = hex
    usedIds.add(Number(material.id))
    usedColors.add(hex)
    changed = true
  }

  return { materialIds: nextMaterialIds, colors: nextColors, changed }
}
