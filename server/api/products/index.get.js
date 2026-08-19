import { asc } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { getHppForProducts } from '../../utils/productHpp.js'

export default defineEventHandler(async () => {
  const db = useDb()
  const products = await db.select().from(schema.products).orderBy(asc(schema.products.name))
  const hppMap = await getHppForProducts(products.map((p) => p.id))
  return products.map((p) => {
    const hpp = hppMap.get(p.id)
    const printMinutesPerUnit = (hpp?.recipeRows || []).reduce(
      (max, r) => Math.max(max, r.printTimeMinutes || 0),
      0
    )
    return {
      ...p,
      hpp: hpp?.total ?? 0,
      hasRecipe: (hpp?.recipeRows?.length ?? 0) > 0,
      printMinutesPerUnit
    }
  })
})
