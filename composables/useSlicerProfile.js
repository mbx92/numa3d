import { TOOL_PRINT_PROFILES } from '~/utils/slicerProjectSettings.js'

export function useSlicerProfile(tool) {
  const profile = TOOL_PRINT_PROFILES[tool]
  if (!profile) throw new Error('Profil generator tidak dikenal')
  const includePrintProfile = ref(true)
  const printExportOptions = computed(() => ({ processPreset: includePrintProfile.value ? profile.id : null }))
  return { includePrintProfile, printExportOptions }
}
