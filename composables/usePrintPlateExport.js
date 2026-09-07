import { downloadBlob } from '~/utils/downloadBlob.js'

export function usePrintPlateExport(result, ensureFresh) {
  const toast = useToast()
  const exportingPlate = ref(false)
  async function downloadPlate() {
    if (exportingPlate.value) return
    exportingPlate.value = true
    try {
      if (ensureFresh && !(await ensureFresh())) return
      if (!result.value) return
      const blob = result.value.getPlate3mfBlob()
      downloadBlob(blob, `${result.value.slug}_plate_260x260.3mf`)
      toast.success('Plate 3MF siap dibuka sebagai proyek di OrcaSlicer')
    } catch (error) {
      toast.error(error.message || 'Export plate gagal')
    } finally {
      exportingPlate.value = false
    }
  }
  return { downloadPlate, exportingPlate }
}
