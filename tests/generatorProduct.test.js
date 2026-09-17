import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { zipSync, strToU8 } from 'fflate'
import { eq } from 'drizzle-orm'
import { generatorProductRecipes } from '../utils/generatorProduct.js'
import { validateGeneratorProduct, saveGeneratorProduct } from '../server/utils/generatorProduct.js'

const file = Buffer.from(zipSync({ '3D/3dmodel.model': strToU8('<model/>') }))
const input = () => ({ requestId: randomUUID(), name: ' Custom AB ', tool: 'keychain', printTimeSeconds: 1594, machineId: null, materials: [{ materialId: 1, quantityUsed: 4.65 }] })

test('new product input rejects incomplete recipes and invalid slice data', () => {
  assert.equal(validateGeneratorProduct(input(), file).name, 'Custom AB')
  for (const override of [
    { name: ' ' }, { name: 'x'.repeat(121) }, { tool: 'toString' }, { requestId: '../unsafe' },
    { printTimeSeconds: 0 }, { printTimeSeconds: Infinity }, { machineId: -1 },
    { materials: [] }, { materials: [{ materialId: 1, quantityUsed: -2 }] },
    { materials: [{ materialId: 1, quantityUsed: 2 }, { materialId: 1, quantityUsed: 3 }] }
  ]) assert.throws(() => validateGeneratorProduct({ ...input(), ...override }, file), { statusCode: 400 })
  assert.throws(() => validateGeneratorProduct(input(), Buffer.from('not a 3mf')), { statusCode: 400 })
})

test('recipe assigns plate duration and machine once, and no failure allowance to purchased parts', () => {
  const rows = generatorProductRecipes([
    { materialId: 3, quantityUsed: 1, type: 'part' },
    { materialId: 1, quantityUsed: 4.65, type: 'filament' },
    { materialId: 2, quantityUsed: 2, type: 'filament' }
  ], { printTimeSeconds: 1594, machineId: '7' })
  assert.deepEqual(rows.map((row) => row.printTimeMinutes), [0, 27, 0])
  assert.deepEqual(rows.map((row) => row.machineId), [null, 7, null])
  assert.deepEqual(rows.map((row) => row.failureRatePercent), [0, 5, 5])
  assert.deepEqual(rows.map((row) => row.quantityUsed), [1, 4.65, 2])
})

// Opt in against a migrated local database. All fixture writes roll back.
test('database: new drafts, recipe + file, retry deduplication, and upload failure rollback', { skip: process.env.GENERATOR_PRODUCT_DB_TEST !== '1' }, async () => {
  await import('dotenv/config')
  const { default: pg } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('../server/db/schema.js')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool, { schema })
  const rollback = new Error('rollback test fixtures')
  try {
    await assert.rejects(db.transaction(async (tx) => {
      const [user] = await tx.insert(schema.users).values({ username: `generator-test-${randomUUID()}`, passwordHash: 'test', role: 'admin' }).returning()
      const [material] = await tx.insert(schema.materials).values({ name: 'Test PLA', type: 'filament', unit: 'gram', pricePerUnit: 200 }).returning()
      const [machine] = await tx.insert(schema.machines).values({ name: 'Test Kobra X', powerWatt: 150 }).returning()
      const blobs = new Map()
      let uploads = 0
      const storage = {
        async put(key, bytes) { uploads++; blobs.set(key, bytes) },
        async remove(key) { blobs.delete(key) }
      }
      const data = { ...input(), machineId: machine.id, materials: [{ materialId: material.id, quantityUsed: 4.65 }] }
      const save = (overrides = {}) => saveGeneratorProduct({ db: tx, storage, auth: user, input: data, file, ...overrides })
      const product = await save()
      assert.equal(product.status, 'draft')
      const recipe = await tx.select().from(schema.productRecipes).where(eq(schema.productRecipes.productId, product.id))
      assert.equal(recipe.length, 1)
      assert.equal(recipe[0].quantityUsed, 4.65)
      assert.equal(recipe[0].printTimeMinutes, 27)
      assert.equal(recipe[0].machineId, machine.id)
      const [attachment] = await tx.select().from(schema.productFiles).where(eq(schema.productFiles.productId, product.id))
      assert.deepEqual(blobs.get(attachment.objectKey), file)
      assert.equal(attachment.contentType, 'model/3mf')
      assert.equal((await save()).id, product.id)
      assert.equal(uploads, 1)
      const second = await save({ input: { ...data, requestId: randomUUID() } })
      assert.notEqual(second.id, product.id)
      assert.equal(second.name, product.name)

      const countProducts = async () => (await tx.select().from(schema.products)).length
      const before = await countProducts()
      await assert.rejects(save({ input: { ...data, requestId: randomUUID() }, storage: {
        ...storage, async put(key, bytes) { blobs.set(key, bytes); throw new Error('storage offline') }
      } }), /storage offline/)
      assert.equal(await countProducts(), before)
      assert.equal(blobs.size, 2)
      // Failure after upload also rolls back metadata and removes the orphan.
      await assert.rejects(save({ auth: { id: -1 }, input: { ...data, requestId: randomUUID() } }))
      assert.equal(await countProducts(), before)
      assert.equal(blobs.size, 2)
      await assert.rejects(save({ input: { ...data, requestId: randomUUID(), machineId: -1 } }), { statusCode: 400 })
      await assert.rejects(save({ input: { ...data, requestId: randomUUID(), materials: [{ materialId: 2147483647, quantityUsed: 1 }] } }), { statusCode: 400 })
      assert.equal(await countProducts(), before)
      const audits = await tx.select().from(schema.auditLogs).where(eq(schema.auditLogs.userId, user.id))
      assert.equal(audits.length, 2)
      throw rollback
    }), (error) => error === rollback)
  } finally { await pool.end() }
})
