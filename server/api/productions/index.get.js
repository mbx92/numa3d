import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const conds = []
  if (q.status) conds.push(eq(schema.productions.status, q.status))
  if (q.productId) conds.push(eq(schema.productions.productId, Number(q.productId)))
  if (q.dateFrom) conds.push(gte(schema.productions.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.productions.date, q.dateTo))

  const rows = await db
    .select({
      id: schema.productions.id,
      date: schema.productions.date,
      productId: schema.productions.productId,
      productName: schema.products.name,
      productImageKey: schema.products.imageKey,
      productStock: schema.products.stockQuantity,
      machineId: schema.productions.machineId,
      machineName: schema.machines.name,
      quantityPlanned: schema.productions.quantityPlanned,
      quantityGood: schema.productions.quantityGood,
      quantityFailed: schema.productions.quantityFailed,
      status: schema.productions.status,
      notes: schema.productions.notes,
      stockApplied: schema.productions.stockApplied,
      createdAt: schema.productions.createdAt
    })
    .from(schema.productions)
    .leftJoin(schema.products, eq(schema.productions.productId, schema.products.id))
    .leftJoin(schema.machines, eq(schema.productions.machineId, schema.machines.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.productions.date), desc(schema.productions.id))

  return rows
})
