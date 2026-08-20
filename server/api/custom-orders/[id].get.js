import { desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { hppForCustomOrder } from '../../utils/customOrders.js'

function pickProduction(jobs) {
  const rank = { in_progress: 3, queued: 2, done: 1, cancelled: 0 }
  return [...jobs].sort((a, b) => (rank[b.status] || 0) - (rank[a.status] || 0) || b.id - a.id)[0] || null
}

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

  const productions = await db
    .select()
    .from(schema.productions)
    .where(eq(schema.productions.customOrderId, id))
    .orderBy(desc(schema.productions.id))
  const retried = new Set(productions.filter((p) => p.retryOfId).map((p) => p.retryOfId))
  const jobs = productions.map((p) => ({ ...p, retried: retried.has(p.id) }))
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
    production: pickProduction(jobs),
    productions: jobs,
    sale: sale || null,
    files
  }
})
