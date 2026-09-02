import { DEFAULT_MATERIAL_COLOR, parseMaterialColor } from '~/utils/materialColor.js'

/** Material dari DB untuk pemilihan warna di generator tools. */
export function useToolMaterials() {
  const { data: materials, pending, refresh } = useFetch('/api/materials', {
    server: false,
    lazy: true
  })

  const list = computed(() => materials.value || [])

  const withColor = computed(() =>
    list.value.filter((m) => parseMaterialColor(m.color, null))
  )

  function filterByType(type) {
    if (!type) return withColor.value
    return withColor.value.filter((m) => m.type === type)
  }

  function materialById(id) {
    if (id == null || id === '') return null
    return list.value.find((m) => Number(m.id) === Number(id)) || null
  }

  function hexFromMaterial(m) {
    if (!m) return null
    return parseMaterialColor(m.color, null)
  }

  function hexFromMaterialId(id) {
    return hexFromMaterial(materialById(id)) || DEFAULT_MATERIAL_COLOR
  }

  return {
    materials: list,
    materialsWithColor: withColor,
    pending,
    refresh,
    filterByType,
    materialById,
    hexFromMaterial,
    hexFromMaterialId
  }
}
