export function normalizeClientFilamentTypeName(value) {
  if (typeof value !== 'string') throw new Error('Nama jenis filament wajib diisi')
  const name = value.replace(/\s+/g, ' ').trim()
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Nama jenis filament harus 1–60 karakter')
  return name
}

export function filterFilamentMaterials(materials, selectedType = 'all') {
  if (selectedType === 'all') return materials
  if (selectedType === 'unassigned') return materials.filter((material) => material.type === 'filament' && material.filamentTypeId == null)
  return materials.filter((material) => material.type === 'filament' && String(material.filamentTypeId) === String(selectedType))
}

export function filamentFilterTabs(types, materials) {
  const tabs = [
    { id: 'all', label: 'Semua', count: materials.length },
    ...types.map((type) => ({ id: String(type.id), label: type.name, count: filterFilamentMaterials(materials, type.id).length }))
  ]
  const unassigned = filterFilamentMaterials(materials, 'unassigned').length
  if (unassigned) tabs.push({ id: 'unassigned', label: 'Belum diatur', count: unassigned })
  return tabs
}
