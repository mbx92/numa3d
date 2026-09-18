export function customMaterialUsage(order) {
  return order?.materialUsage?.length ? order.materialUsage : [{ materialId: order?.materialId, quantityUsed: Number(order?.materialQuantityUsed) || 0 }]
}

export function customMaterialRecipes(order, { materials = [], material = null, machine = null } = {}) {
  return customMaterialUsage(order).map((line, index) => ({
    materialId: line.materialId, quantityUsed: line.quantityUsed,
    material: materials.find((row) => Number(row.id) === Number(line.materialId)) || (material && (material.id == null || Number(material.id) === Number(line.materialId)) ? material : null),
    printTimeMinutes: index === 0 ? order.printTimeMinutes : 0,
    machineId: index === 0 ? order.machineId : null, machine: index === 0 ? machine : null,
    failureRatePercent: order.failureRatePercent,
    laborMinutes: index === 0 ? order.laborMinutes : 0, laborRatePerHour: index === 0 ? order.laborRatePerHour : 0
  }))
}

export function stockShortages(usage, materials, quantity = 1) {
  return usage.flatMap((line) => {
    const material = materials.find((row) => Number(row.id) === Number(line.materialId))
    const needed = Number(line.quantityUsed) * quantity
    const stock = Number(material?.stockQuantity) || 0
    return !material || needed > stock + 0.00001 ? [{ materialId: line.materialId, name: material?.name || `Material #${line.materialId}`, needed, stock }] : []
  })
}
