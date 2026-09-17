// Used by both the browser preview and the server that saves the recipe.
// Keep this module independent of client-only utilities.
export function generatorProductRecipes(lines, { printTimeSeconds, machineId = null } = {}) {
  const seconds = Number(printTimeSeconds)
  const printTimeMinutes = Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0
  const firstFilament = lines.findIndex((line) => line.type === 'filament')
  return lines.map((line, index) => ({
    materialId: line.materialId,
    quantityUsed: line.quantityUsed,
    printTimeMinutes: index === firstFilament ? printTimeMinutes : 0,
    machineId: index === firstFilament && machineId ? Number(machineId) : null,
    failureRatePercent: line.type === 'part' ? 0 : 5,
    laborMinutes: 0,
    laborRatePerHour: 0
  }))
}
