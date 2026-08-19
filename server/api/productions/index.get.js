import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const conds = []
  if (q.status) conds.push(eq(schema.productions.status, q.status))
  if (q.productId) conds.push(eq(schema.productions.productId, Number(q.productId)))
  if (q.custom === '1') conds.push(sql`${schema.productions.customOrderId} is not null`)
  if (q.custom === '0') conds.push(sql`${schema.productions.customOrderId} is null`)
  if (q.dateFrom) conds.push(gte(schema.productions.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.productions.date, q.dateTo))

  const rows = await db
    .select({
      id: schema.productions.id,
      date: schema.productions.date,
      productId: schema.productions.productId,
      customOrderId: schema.productions.customOrderId,
      productName: sql`coalesce(${schema.products.name}, ${schema.customOrders.title})`.as('productName'),
      customerName: schema.customOrders.customerName,
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
      startedAt: schema.productions.startedAt,
      durationMinutes: schema.productions.durationMinutes,
      createdAt: schema.productions.createdAt,
      printMinutesPerUnit: schema.customOrders.printTimeMinutes
    })
    .from(schema.productions)
    .leftJoin(schema.products, eq(schema.productions.productId, schema.products.id))
    .leftJoin(schema.customOrders, eq(schema.productions.customOrderId, schema.customOrders.id))
    .leftJoin(schema.machines, eq(schema.productions.machineId, schema.machines.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.productions.date), desc(schema.productions.id))

  const productIds = [...new Set(rows.map((r) => r.productId).filter(Boolean))]
  const printMap = new Map()
  if (productIds.length) {
    const recipes = await db
      .select({
        productId: schema.productRecipes.productId,
        printTimeMinutes: schema.productRecipes.printTimeMinutes
      })
      .from(schema.productRecipes)
      .where(inArray(schema.productRecipes.productId, productIds))
    for (const r of recipes) {
      printMap.set(r.productId, Math.max(printMap.get(r.productId) || 0, r.printTimeMinutes || 0))
    }
  }

  return rows.map((r) => {
    const printMinutesPerUnit = r.customOrderId
      ? r.printMinutesPerUnit || 0
      : printMap.get(r.productId) || 0
    const durationMinutes = r.durationMinutes || printMinutesPerUnit * (r.quantityPlanned || 0)
    return { ...r, printMinutesPerUnit, durationMinutes, isCustom: !!r.customOrderId }
  })
})
