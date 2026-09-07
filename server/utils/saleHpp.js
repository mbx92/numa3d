import { eq } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { getHppForProduct } from './productHpp.js'
import { hppForCustomOrder } from './customOrders.js'

export async function snapshotHppPerUnit({ productId, customOrderId, tx } = {}) {
  if (customOrderId) {
    const db = tx || useDb()
    const [row] = await db
      .select({
        order: schema.customOrders,
        material: schema.materials,
        machine: schema.machines,
        packaging: schema.packaging
      })
      .from(schema.customOrders)
      .leftJoin(schema.materials, eq(schema.customOrders.materialId, schema.materials.id))
      .leftJoin(schema.machines, eq(schema.customOrders.machineId, schema.machines.id))
      .leftJoin(schema.packaging, eq(schema.customOrders.packagingId, schema.packaging.id))
      .where(eq(schema.customOrders.id, customOrderId))
    if (!row) return 0
    const hpp = await hppForCustomOrder(row.order, {
      material: row.material,
      machine: row.machine,
      packaging: row.packaging
    })
    return hpp.total
  }
  if (productId) {
    const hpp = await getHppForProduct(productId)
    return hpp?.total ?? 0
  }
  return 0
}
