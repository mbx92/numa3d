import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'
import { eq } from 'drizzle-orm'

// Real handler transactions against a migrated local DB; fixture writes roll back.
test('database: STL / 3MF orders, trusted statistics, original file retention and storage failure rollback', { skip: process.env.CUSTOM_ORDER_DB_TEST !== '1' }, async () => {
  await import('dotenv/config')
  const { default: pg } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('../server/db/schema.js')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool, { schema })
  const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  const dbModule = dataModule(`export * as schema from '${new URL('../server/db/schema.js', import.meta.url).href}'; export const useDb = () => globalThis.__customOrderTestDb;`)
  const storageModule = dataModule(`export const ensureBucket = async () => {}; export const minioBucket = () => 'test'; export const useMinio = () => globalThis.__customOrderTestStorage;`)
  const hooks = registerHooks({ resolve(specifier, context, next) {
    const resolved = next(specifier, context)
    if (resolved.url.endsWith('/server/db/index.js')) return { url: dbModule, shortCircuit: true }
    if (resolved.url.endsWith('/server/utils/minio.js')) return { url: storageModule, shortCircuit: true }
    return resolved
  } })
  globalThis.defineEventHandler = (handler) => handler
  globalThis.readBody = async (event) => event.body
  globalThis.getRouterParam = (event) => String(event.id)
  globalThis.createError = (data) => Object.assign(new Error(data.statusMessage), data)
  const create = (await import('../server/api/custom-orders/index.post.js')).default
  const update = (await import('../server/api/custom-orders/[id].put.js')).default
  const rollback = new Error('rollback test fixtures')
  try {
    await assert.rejects(db.transaction(async (tx) => {
      globalThis.__customOrderTestDb = tx
      const blobs = new Map()
      let failStat = false
      globalThis.__customOrderTestStorage = {
        async copyObject(bucket, key, source) {
          assert.equal(bucket, 'test')
          const bytes = blobs.get(source.replace('/test/', ''))
          if (!bytes) throw new Error('source missing')
          blobs.set(key, bytes)
        },
        async statObject(bucket, key) { if (failStat) throw new Error('storage unavailable'); return { size: blobs.get(key).length } },
        async removeObject(bucket, key) { blobs.delete(key) }
      }
      const [user] = await tx.insert(schema.users).values({ username: `custom-test-${randomUUID()}`, passwordHash: 'test', role: 'staff' }).returning()
      const [material] = await tx.insert(schema.materials).values({ name: 'Test PLA', color: '#fff', type: 'filament', unit: 'gram', pricePerUnit: 200, stockQuantity: 100 }).returning()
      const [black] = await tx.insert(schema.materials).values({ name: 'Test PLA Black', color: '#000000', type: 'filament', unit: 'gram', pricePerUnit: 300, stockQuantity: 100 }).returning()
      const [resin] = await tx.insert(schema.materials).values({ name: 'Test Resin', type: 'resin', unit: 'ml', pricePerUnit: 100 }).returning()
      const { resolveCustomMaterials } = await import('../server/utils/customModelMaterials.js')
      const inspection = { colors: ['#ffffff', '#ff0000'], maxColors: 4 }
      const mapping = await resolveCustomMaterials(tx, inspection, [material.id, black.id])
      assert.deepEqual(mapping.colors, ['#ffffff', '#000000'])
      assert.deepEqual(mapping.slotMap, [0, 1])
      const merged = await resolveCustomMaterials(tx, inspection, [black.id, black.id])
      assert.deepEqual(merged.materialIds, [black.id])
      assert.deepEqual(merged.slotMap, [0, 0])
      await assert.rejects(resolveCustomMaterials(tx, inspection, [material.id]), /setiap warna/)
      await assert.rejects(resolveCustomMaterials(tx, inspection, [material.id, resin.id]), /filament PLA/)
      await assert.rejects(resolveCustomMaterials(tx, { ...inspection, maxColors: 1 }, [material.id, black.id]), /Maksimal 1/)
      await tx.update(schema.materials).set({ stockQuantity: 0 }).where(eq(schema.materials.id, black.id))
      await assert.rejects(resolveCustomMaterials(tx, inspection, [material.id, black.id]), /kehabisan stok/)
      await tx.update(schema.materials).set({ stockQuantity: 100 }).where(eq(schema.materials.id, black.id))
      const [job] = await tx.insert(schema.slicerJobs).values({
        userId: user.id, filename: 'box.stl', objectKey: `slicer/test/${randomUUID()}.stl`, tool: 'custom-order', status: 'completed',
        result: { totalGrams: 2.02, printTimeSeconds: 577, colors: ['#FFFFFF'], filamentGrams: [2.02], primeTower: false, filamentChanges: 0 }
      }).returning()
      const file = Buffer.from('STL fixture already validated by queue')
      blobs.set(job.objectKey, file)
      const body = {
        date: '2026-09-18', customerName: 'Test Customer', title: 'Test Custom STL', quantity: 3, materialId: material.id,
        materialQuantityUsed: 999, printTimeMinutes: 999, slicerJobId: job.id
      }
      const event = { context: { auth: user }, body }
      await assert.rejects(create({ ...event, body: { ...body, slicerJobId: null } }), /selesaikan slicing/)
      await assert.rejects(create({ ...event, body: { ...body, materialId: resin.id } }), /filament PLA/)
      const countOrders = async () => (await tx.select().from(schema.customOrders)).length
      const before = await countOrders()
      failStat = true
      await assert.rejects(create(event), /storage unavailable/)
      assert.equal(await countOrders(), before)
      assert.equal(blobs.size, 1)
      failStat = false
      const order = await create(event)
      assert.equal(order.materialQuantityUsed, 2.02)
      assert.equal(order.printTimeMinutes, 10)
      assert.equal(order.slicerResult.jobId, job.id)
      const [production] = await tx.select().from(schema.productions).where(eq(schema.productions.customOrderId, order.id))
      assert.equal(production.durationMinutes, 30)
      assert.equal(production.quantityPlanned, 3)
      const [attachment] = await tx.select().from(schema.customOrderFiles).where(eq(schema.customOrderFiles.customOrderId, order.id))
      assert.notEqual(attachment.objectKey, job.objectKey)
      assert.deepEqual(blobs.get(attachment.objectKey), file)
      assert.equal(attachment.contentType, 'model/stl')
      const [projectJob] = await tx.insert(schema.slicerJobs).values({
        userId: user.id, filename: 'box.3mf', objectKey: `slicer/test/${randomUUID()}.3mf`, tool: 'custom-order', status: 'completed',
        result: { ...job.result, inputFormat: '3mf' }
      }).returning()
      const originalProject = Buffer.from('3MF fixture already validated by worker')
      blobs.set(projectJob.objectKey, originalProject)
      const projectOrder = await create({ ...event, body: { ...body, slicerJobId: projectJob.id } })
      const [projectFile] = await tx.select().from(schema.customOrderFiles).where(eq(schema.customOrderFiles.customOrderId, projectOrder.id))
      assert.equal(projectFile.filename, 'box.3mf')
      assert.equal(projectFile.contentType, 'model/3mf')
      assert.equal(projectFile.objectKey.endsWith('.3mf'), true)
      assert.deepEqual(blobs.get(projectFile.objectKey), originalProject)
      assert.equal(projectOrder.slicerResult.inputFormat, '3mf')
      assert.equal(projectOrder.materialQuantityUsed, 2.02)
      const [multiJob] = await tx.insert(schema.slicerJobs).values({
        userId: user.id, filename: 'multi.3mf', objectKey: `slicer/test/${randomUUID()}.3mf`, tool: 'custom-order', status: 'completed',
        inputConfig: { materialIds: [material.id, black.id] },
        result: { inputFormat: '3mf', totalGrams: 10, printTimeSeconds: 600, colors: ['#ffffff', '#000000'], filamentGrams: [4, 6], primeTower: true, filamentChanges: 5 }
      }).returning()
      blobs.set(multiJob.objectKey, originalProject)
      const multi = await create({ ...event, body: { ...body, slicerJobId: multiJob.id, materialId: resin.id } })
      assert.equal(multi.materialId, material.id) // trusted job mapping takes priority
      const usage = await tx.select().from(schema.customOrderMaterials).where(eq(schema.customOrderMaterials.customOrderId, multi.id))
      assert.deepEqual(usage.map((line) => [line.materialId, line.quantityUsed]), [[material.id, 4], [black.id, 6]])
      const { hppForCustomOrder } = await import('../server/utils/customOrders.js')
      const hpp = await hppForCustomOrder(multi)
      assert.equal(hpp.breakdown.materialCost, 2600)
      const { applyProductionCompletion, reverseProductionCompletion } = await import('../server/utils/productionStock.js')
      const completion = { customOrderId: multi.id, quantityGood: 2, quantityFailed: 1 }
      await applyProductionCompletion(tx, schema, completion)
      const stocks = async () => (await tx.select().from(schema.materials)).filter((m) => [material.id, black.id].includes(m.id)).map((m) => m.stockQuantity)
      assert.deepEqual(await stocks(), [88, 82])
      await reverseProductionCompletion(tx, schema, completion)
      assert.deepEqual(await stocks(), [100, 100])
      await assert.rejects(create({ ...event, body: { ...body, slicerJobId: multiJob.id, quantity: 20 } }), /Test PLA Black: perlu/)
      await assert.rejects(tx.transaction(async (nested) => applyProductionCompletion(nested, schema, { ...completion, quantityGood: 100 })), /Stok material/)
      assert.deepEqual(await stocks(), [100, 100])
      const commercial = await update({ ...event, id: multi.id, body: { ...body, slicerJobId: null, materialId: black.id } })
      assert.equal(commercial.materialId, material.id)
      const changed = await update({ ...event, id: order.id, body: { ...body, slicerJobId: null, title: 'Updated Title' } })
      assert.equal(changed.materialQuantityUsed, 2.02)
      assert.equal(changed.printTimeMinutes, 10)
      await tx.update(schema.productions).set({ status: 'in_progress' }).where(eq(schema.productions.id, production.id))
      await assert.rejects(update({ ...event, id: order.id }), /setelah produksi dimulai/)
      await tx.delete(schema.slicerJobs).where(eq(schema.slicerJobs.id, job.id))
      blobs.delete(job.objectKey)
      assert.deepEqual(blobs.get(attachment.objectKey), file)
      const [recorded] = await tx.select().from(schema.customOrders).where(eq(schema.customOrders.id, order.id))
      assert.equal(recorded.slicerResult.totalGrams, 2.02)
      throw rollback
    }), (error) => error === rollback)
  } finally {
    hooks.deregister()
    delete globalThis.__customOrderTestDb
    delete globalThis.__customOrderTestStorage
    await pool.end()
  }
})
