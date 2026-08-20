import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const conds = []
  if (q.status) conds.push(eq(schema.customOrders.status, q.status))
  if (q.dateFrom) conds.push(gte(schema.customOrders.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.customOrders.date, q.dateTo))

  const rows = await db
    .select({
      id: schema.customOrders.id,
      date: schema.customOrders.date,
      customerName: schema.customOrders.customerName,
      title: schema.customOrders.title,
      channel: schema.customOrders.channel,
      quantity: schema.customOrders.quantity,
      pricePerUnit: schema.customOrders.pricePerUnit,
      materialId: schema.customOrders.materialId,
      materialName: schema.materials.name,
      machineId: schema.customOrders.machineId,
      machineName: schema.machines.name,
      printTimeMinutes: schema.customOrders.printTimeMinutes,
      status: schema.customOrders.status,
      notes: schema.customOrders.notes,
      productionId: schema.productions.id,
      productionStatus: schema.productions.status,
      quantityGood: schema.productions.quantityGood,
      quantityFailed: schema.productions.quantityFailed,
      startedAt: schema.productions.startedAt,
      durationMinutes: schema.productions.durationMinutes,
      saleId: schema.sales.id
    })
    .from(schema.customOrders)
    .leftJoin(schema.materials, eq(schema.customOrders.materialId, schema.materials.id))
    .leftJoin(schema.machines, eq(schema.customOrders.machineId, schema.machines.id))
    .leftJoin(schema.productions, eq(schema.productions.customOrderId, schema.customOrders.id))
    .leftJoin(schema.sales, eq(schema.sales.customOrderId, schema.customOrders.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.customOrders.date), desc(schema.customOrders.id))

  const rank = { in_progress: 3, queued: 2, done: 1, cancelled: 0 }
  const byId = new Map()
  for (const r of rows) {
    const prev = byId.get(r.id)
    if (!prev) {
      byId.set(r.id, r)
      continue
    }
    const better =
      (rank[r.productionStatus] || 0) > (rank[prev.productionStatus] || 0) ||
      ((rank[r.productionStatus] || 0) === (rank[prev.productionStatus] || 0) && (r.productionId || 0) > (prev.productionId || 0))
    if (better) byId.set(r.id, r)
  }
  return [...byId.values()]
})
