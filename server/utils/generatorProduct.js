import { eq, inArray, sql } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { generatorProductRecipes } from '#shared/utils/generatorProduct.js'

const TOOL_NAMES = { keychain: 'Keychain', clicker: 'Clicker', 'qr-plate': 'QR Plate' }
const MAX_BYTES = 40 * 1024 * 1024
const invalid = (message) => Object.assign(new Error(message), { statusCode: 400 })

export function validateGeneratorProduct(input, file) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Data produk tidak valid')
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 120) throw invalid('Nama produk wajib diisi, maksimal 120 karakter')
  if (!Object.hasOwn(TOOL_NAMES, input.tool)) throw invalid('Generator tidak dikenal')
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) {
    throw invalid('ID penyimpanan tidak valid')
  }
  if (!file?.length || file.length > MAX_BYTES) throw invalid('File 3MF wajib disertakan, maksimal 40 MB')
  if (file[0] !== 0x50 || file[1] !== 0x4b || file[2] !== 3 || file[3] !== 4) throw invalid('Format file 3MF tidak valid')
  const printTimeSeconds = Number(input.printTimeSeconds)
  if (!Number.isFinite(printTimeSeconds) || printTimeSeconds <= 0 || printTimeSeconds > 365 * 86400) throw invalid('Waktu slice tidak valid')
  const machineId = input.machineId == null || input.machineId === '' ? null : Number(input.machineId)
  if (machineId !== null && (!Number.isSafeInteger(machineId) || machineId <= 0)) throw invalid('Mesin tidak valid')
  if (!Array.isArray(input.materials) || !input.materials.length || input.materials.length > 16) throw invalid('Material hasil slice wajib diisi')
  const seen = new Set()
  const materials = input.materials.map((line) => {
    const materialId = Number(line?.materialId)
    const quantityUsed = Number(line?.quantityUsed)
    if (!Number.isSafeInteger(materialId) || materialId <= 0 || seen.has(materialId)) throw invalid('Material tidak valid atau berulang')
    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0 || quantityUsed > 1000000) throw invalid('Jumlah material tidak valid')
    seen.add(materialId)
    return { materialId, quantityUsed }
  })
  return { name, tool: input.tool, requestId: input.requestId.toLowerCase(), printTimeSeconds, machineId, materials }
}

// Keep product, recipe, file metadata and audit in one transaction. Storage is
// injected so an upload failure and retries can be tested without a real bucket.
export async function saveGeneratorProduct({ db, storage, auth, input, file }) {
  const data = validateGeneratorProduct(input, file)
  const objectKey = `products/generator/${auth.id}/${data.requestId}.3mf`
  const lock = (tx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${objectKey}))`)
  const findSaved = (tx) => tx.select({ product: schema.products }).from(schema.productFiles)
    .innerJoin(schema.products, eq(schema.products.id, schema.productFiles.productId))
    .where(eq(schema.productFiles.objectKey, objectKey)).limit(1)
  let uploadAttempted = false
  try {
    return await db.transaction(async (tx) => {
      await lock(tx)
      const [saved] = await findSaved(tx)
      if (saved) return saved.product

      const catalog = await tx.select().from(schema.materials).where(inArray(schema.materials.id, data.materials.map((line) => line.materialId)))
      const lines = data.materials.map((line) => {
        const material = catalog.find((item) => item.id === line.materialId)
        if (!material || (material.type !== 'part' && !(material.type === 'filament' && material.unit === 'gram'))) {
          throw invalid('Gunakan material filament dalam gram atau komponen yang tersedia')
        }
        return { ...line, type: material.type }
      })
      if (!lines.some((line) => line.type === 'filament')) throw invalid('Material filament hasil slice wajib diisi')
      if (data.machineId) {
        const [machine] = await tx.select({ id: schema.machines.id }).from(schema.machines).where(eq(schema.machines.id, data.machineId))
        if (!machine) throw invalid('Mesin tidak ditemukan')
      }
      const [product] = await tx.insert(schema.products).values({
        name: data.name, status: 'draft', description: `Model custom dari generator ${TOOL_NAMES[data.tool]}.`
      }).returning()
      await tx.insert(schema.productRecipes).values(generatorProductRecipes(lines, data).map((row) => ({ ...row, productId: product.id })))

      uploadAttempted = true
      await storage.put(objectKey, file)
      await tx.insert(schema.productFiles).values({
        productId: product.id, filename: `${data.tool}-${product.id}.3mf`, objectKey,
        sizeBytes: file.length, contentType: 'model/3mf'
      })
      const [user] = await tx.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, auth.id))
      await tx.insert(schema.auditLogs).values({
        userId: auth.id, username: user?.username || `user#${auth.id}`,
        action: 'create', entity: 'product', entityId: product.id,
        summary: `Tambah produk generator "${product.name}" beserta model 3MF dan recipe hasil slice`
      })
      return product
    })
  } catch (error) {
    if (uploadAttempted) {
      // A retry may have committed since rollback. Never remove its file.
      try {
        await db.transaction(async (tx) => {
          await lock(tx)
          if (!(await findSaved(tx)).length) await storage.remove(objectKey)
        })
      } catch (cleanupError) { console.error('Generator upload cleanup failed', cleanupError) }
    }
    throw error
  }
}
