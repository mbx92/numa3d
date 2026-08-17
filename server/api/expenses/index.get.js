import { and, eq, gte, lte, desc, or, exists, sql, inArray } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'

// Filter query: category, productId, dateFrom, dateTo
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const db = useDb()
  const conds = []
  if (q.category) conds.push(eq(schema.expenses.category, q.category))
  if (q.productId) {
    const pid = Number(q.productId)
    conds.push(
      or(
        eq(schema.expenses.relatedProductId, pid),
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.expenseProducts)
            .where(
              and(eq(schema.expenseProducts.expenseId, schema.expenses.id), eq(schema.expenseProducts.productId, pid))
            )
        )
      )
    )
  }
  if (q.dateFrom) conds.push(gte(schema.expenses.date, q.dateFrom))
  if (q.dateTo) conds.push(lte(schema.expenses.date, q.dateTo))

  const list = await db
    .select({
      id: schema.expenses.id,
      date: schema.expenses.date,
      category: schema.expenses.category,
      categoryName: schema.expenseCategories.name,
      description: schema.expenses.description,
      amount: schema.expenses.amount,
      relatedProductId: schema.expenses.relatedProductId,
      productName: schema.products.name,
      fromMachine: schema.machines.id
    })
    .from(schema.expenses)
    .leftJoin(schema.products, eq(schema.expenses.relatedProductId, schema.products.id))
    .leftJoin(schema.expenseCategories, eq(schema.expenses.category, schema.expenseCategories.key))
    .leftJoin(schema.machines, eq(schema.machines.expenseId, schema.expenses.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.expenses.date), desc(schema.expenses.id))

  if (!list.length) return list

  const extra = await db
    .select({
      expenseId: schema.expenseProducts.expenseId,
      productId: schema.expenseProducts.productId,
      productName: schema.products.name
    })
    .from(schema.expenseProducts)
    .innerJoin(schema.products, eq(schema.expenseProducts.productId, schema.products.id))
    .where(
      inArray(
        schema.expenseProducts.expenseId,
        list.map((r) => r.id)
      )
    )

  const namesByExp = {}
  for (const r of extra) {
    ;(namesByExp[r.expenseId] ||= []).push(r.productName)
  }

  return list.map((e) => {
    const names = namesByExp[e.id]
    const fromMachine = Boolean(e.fromMachine)
    if (names?.length) return { ...e, productName: names.join(', '), fromMachine }
    return { ...e, fromMachine }
  })
})
