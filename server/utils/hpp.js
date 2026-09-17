// Rumus HPP murni (tanpa DB). Salinan server — Nitro tidak resolve ../../utils/.
// Jaga sync dengan utils/hpp.js (klien + tes).

export const DEFAULT_ELECTRICITY_RATE = 1445
export const DEFAULT_MACHINE_HOURS = 100
export const DEFAULT_MARGIN_PERCENT = 40
export const DEFAULT_PRICE_ROUND_STEP = 500

export function clampMarginPercent(marginPercent) {
  return Math.min(Math.max(Number(marginPercent) || 0, 0), 95)
}

export function normalizePriceRoundStep(step) {
  const n = Math.round(Number(step) || DEFAULT_PRICE_ROUND_STEP)
  if (n === 100 || n === 1000) return n
  return DEFAULT_PRICE_ROUND_STEP
}

export function suggestedPrice(hpp, marginPercent) {
  const m = clampMarginPercent(marginPercent) / 100
  const cost = Math.max(Number(hpp) || 0, 0)
  if (!cost) return 0
  return Math.round(cost / (1 - m))
}

export function roundPriceUp(amount, step = DEFAULT_PRICE_ROUND_STEP) {
  const n = Math.max(Math.round(Number(amount) || 0), 0)
  const s = Math.max(Math.round(Number(step) || DEFAULT_PRICE_ROUND_STEP), 1)
  if (!n) return 0
  return Math.ceil(n / s) * s
}

export function suggestedPrettyPrice(hpp, marginPercent, step = DEFAULT_PRICE_ROUND_STEP) {
  return roundPriceUp(suggestedPrice(hpp, marginPercent), normalizePriceRoundStep(step))
}

export function sellingPriceFrom({ hpp, listPrice, marginPercent, roundStep, hasRecipe }) {
  const listed = Math.max(Math.round(Number(listPrice) || 0), 0)
  if (listed > 0) return listed
  if (!hasRecipe) return 0
  return suggestedPrettyPrice(hpp, marginPercent, roundStep)
}

export function recordedOrLiveHpp(stored, liveTotal) {
  return stored != null ? Math.max(Math.round(Number(stored) || 0), 0) : Math.max(Number(liveTotal) || 0, 0)
}

export function computeHpp(recipeRows, packagingRows, settings) {
  const rate = settings?.electricityRatePerKwh ?? DEFAULT_ELECTRICITY_RATE
  const usageHours = settings?.machineUsageHoursPerMonth || DEFAULT_MACHINE_HOURS

  let materialCost = 0
  let failureBuffer = 0
  let electricityCost = 0
  let depreciationCost = 0
  let laborCost = 0

  const materialLines = []

  for (const row of recipeRows || []) {
    const matPrice = row.material?.pricePerUnit ?? 0
    const lineMaterial = (Number(row.quantityUsed) || 0) * matPrice
    materialCost += lineMaterial
    failureBuffer += lineMaterial * ((Number(row.failureRatePercent) || 0) / 100)

    const hours = (Number(row.printTimeMinutes) || 0) / 60
    if (row.machine) {
      electricityCost += hours * ((row.machine.powerWatt ?? 0) / 1000) * rate
      const depPerHour =
        (row.machine.purchasePrice ?? 0) /
        Math.max(row.machine.depreciationMonths ?? 1, 1) /
        usageHours
      depreciationCost += hours * depPerHour
    }
    laborCost += ((Number(row.laborMinutes) || 0) / 60) * (Number(row.laborRatePerHour) || 0)

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
  for (const row of packagingRows || []) {
    const line = (Number(row.quantityUsed) || 0) * (row.packaging?.pricePerUnit ?? 0)
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

export function customOrderHppFromForm(form, { materials, machines, packagingItems } = {}, settings) {
  const material = (materials || []).find((m) => Number(m.id) === Number(form?.materialId)) || null
  const machine = (machines || []).find((m) => Number(m.id) === Number(form?.machineId)) || null
  const packaging = (packagingItems || []).find((p) => Number(p.id) === Number(form?.packagingId)) || null
  return computeHpp(
    [
      {
        materialId: form?.materialId,
        quantityUsed: form?.materialQuantityUsed,
        printTimeMinutes: form?.printTimeMinutes,
        machineId: form?.machineId,
        failureRatePercent: form?.failureRatePercent,
        laborMinutes: form?.laborMinutes,
        laborRatePerHour: form?.laborRatePerHour,
        material,
        machine
      }
    ],
    form?.packagingId
      ? [
          {
            packagingId: form.packagingId,
            quantityUsed: form.packagingQuantityUsed,
            packaging
          }
        ]
      : [],
    settings
  )
}
