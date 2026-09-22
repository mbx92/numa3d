const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })

export function normalizeSlicerRecipeConfig(value = {}) {
  const machineId = value.machineId === '' || value.machineId == null ? null : Number(value.machineId)
  if (machineId != null && (!Number.isSafeInteger(machineId) || machineId <= 0)) throw invalid('Mesin tidak valid')
  const failureRatePercent = Number(value.failureRatePercent ?? 5)
  if (!Number.isFinite(failureRatePercent) || failureRatePercent < 0 || failureRatePercent > 100) throw invalid('Persentase gagal cetak harus 0–100')
  const laborMinutes = Math.max(Math.round(Number(value.laborMinutes) || 0), 0)
  const laborRatePerHour = Math.max(Math.round(Number(value.laborRatePerHour) || 0), 0)
  return { machineId, failureRatePercent, laborMinutes, laborRatePerHour }
}

export function productRecipeRowsFromSlice(result, recipeConfig = {}) {
  const materialIds = Array.isArray(result?.materialIds) ? result.materialIds.map(Number) : []
  const grams = Array.isArray(result?.filamentGrams) ? result.filamentGrams.map(Number) : []
  const totalGrams = Number(result?.totalGrams)
  const printTimeSeconds = Number(result?.printTimeSeconds)
  if (!materialIds.length || materialIds.length !== grams.length || materialIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw invalid('Hasil material Orca tidak valid')
  }
  if (!Number.isFinite(totalGrams) || totalGrams <= 0 || !Number.isFinite(printTimeSeconds) || printTimeSeconds < 0 || grams.some((n) => !Number.isFinite(n) || n < 0)) {
    throw invalid('Statistik hasil Orca tidak valid')
  }
  const measured = grams.reduce((sum, value) => sum + value, 0)
  if (measured <= 0) throw invalid('Berat filament hasil Orca kosong')
  const config = normalizeSlicerRecipeConfig(recipeConfig)
  const combined = new Map()
  for (let index = 0; index < materialIds.length; index++) {
    const quantity = (grams[index] / measured) * totalGrams
    combined.set(materialIds[index], (combined.get(materialIds[index]) || 0) + quantity)
  }
  return [...combined.entries()].map(([materialId, quantityUsed], index) => ({
    materialId,
    quantityUsed,
    printTimeMinutes: index === 0 ? Math.ceil(printTimeSeconds / 60) : 0,
    machineId: index === 0 ? config.machineId : null,
    failureRatePercent: config.failureRatePercent,
    laborMinutes: index === 0 ? config.laborMinutes : 0,
    laborRatePerHour: index === 0 ? config.laborRatePerHour : 0
  }))
}
