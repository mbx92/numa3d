import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { hppForCustomOrder } from '../../utils/customOrders.js'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
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
    .where(eq(schema.customOrders.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Pesanan custom tidak ditemukan' })

  const [production] = await db
    .select()
    .from(schema.productions)
    .where(eq(schema.productions.customOrderId, id))
  const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.customOrderId, id))
  const files = await db
    .select()
    .from(schema.customOrderFiles)
    .where(eq(schema.customOrderFiles.customOrderId, id))
  const hpp = await hppForCustomOrder(row.order, {
    material: row.material,
    machine: row.machine,
    packaging: row.packaging
  })

  return {
    ...row.order,
    materialName: row.material?.name || null,
    materialUnit: row.material?.unit || null,
    machineName: row.machine?.name || null,
    packagingName: row.packaging?.name || null,
    hpp: hpp.total,
    hppBreakdown: hpp.breakdown,
    production: production || null,
    sale: sale || null,
    files
  }
})
