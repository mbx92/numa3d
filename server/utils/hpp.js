// Perhitungan HPP per unit produk dari recipe + packaging.
// recipeRows: baris product_recipes yang sudah di-join material & machine.
// packagingRows: baris product_packaging yang sudah di-join packaging.
// settings: baris app_settings (tarif listrik & asumsi jam pakai mesin/bulan).
export function computeHpp(recipeRows, packagingRows, settings) {
  const rate = settings?.electricityRatePerKwh ?? 1445
  const usageHours = settings?.machineUsageHoursPerMonth || 100

  let materialCost = 0
  let failureBuffer = 0
  let electricityCost = 0
  let depreciationCost = 0
  let laborCost = 0

  const materialLines = []

  for (const row of recipeRows) {
    const matPrice = row.material?.pricePerUnit ?? 0
    const lineMaterial = row.quantityUsed * matPrice
    materialCost += lineMaterial
    failureBuffer += lineMaterial * ((row.failureRatePercent ?? 0) / 100)

    const hours = (row.printTimeMinutes ?? 0) / 60
    if (row.machine) {
      electricityCost += hours * ((row.machine.powerWatt ?? 0) / 1000) * rate
      const depPerHour =
        (row.machine.purchasePrice ?? 0) /
        Math.max(row.machine.depreciationMonths ?? 1, 1) /
        usageHours
      depreciationCost += hours * depPerHour
    }
    laborCost += ((row.laborMinutes ?? 0) / 60) * (row.laborRatePerHour ?? 0)

    materialLines.push({
      materialId: row.materialId,
      materialName: row.material?.name ?? '?',
      quantityUsed: row.quantityUsed,
      unit: row.material?.unit ?? '',
      pricePerUnit: matPrice,
      cost: Math.round(lineMaterial)
    })
  }

  let packagingCost = 0
  const packagingLines = []
  for (const row of packagingRows) {
    const line = row.quantityUsed * (row.packaging?.pricePerUnit ?? 0)
    packagingCost += line
    packagingLines.push({
      packagingId: row.packagingId,
      packagingName: row.packaging?.name ?? '?',
      quantityUsed: row.quantityUsed,
      unit: row.packaging?.unit ?? '',
      pricePerUnit: row.packaging?.pricePerUnit ?? 0,
      cost: Math.round(line)
    })
  }

  const breakdown = {
    materialCost: Math.round(materialCost),
    failureBuffer: Math.round(failureBuffer),
    electricityCost: Math.round(electricityCost),
    depreciationCost: Math.round(depreciationCost),
    laborCost: Math.round(laborCost),
    packagingCost: Math.round(packagingCost)
  }
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)

  return { total, breakdown, materialLines, packagingLines }
}

export function suggestedPrice(hpp, marginPercent) {
  const m = Math.min(Math.max(marginPercent, 0), 95) / 100
  return Math.round(hpp / (1 - m))
}
