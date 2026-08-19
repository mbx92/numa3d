import { eq } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { computeHpp } from './hpp.js'
import { getSettings } from './settings.js'

const CHANNELS = ['tokopedia', 'shopee', 'tiktok_shop', 'instagram', 'whatsapp', 'direct', 'other']

export function parseCustomOrderBody(body) {
  if (!body.date || !String(body.customerName || '').trim() || !String(body.title || '').trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Tanggal, nama pelanggan, dan judul desain wajib diisi' })
  }
  if (!body.materialId) {
    throw createError({ statusCode: 400, statusMessage: 'Material wajib dipilih' })
  }
  const machineId = body.machineId ? Number(body.machineId) : null
  const packagingId = body.packagingId ? Number(body.packagingId) : null
  return {
    date: body.date,
    customerName: String(body.customerName).trim(),
    title: String(body.title).trim(),
    channel: CHANNELS.includes(body.channel) ? body.channel : 'direct',
    quantity: Math.max(Math.round(Number(body.quantity) || 1), 1),
    pricePerUnit: Math.max(Math.round(Number(body.pricePerUnit) || 0), 0),
    materialId: Number(body.materialId),
    materialQuantityUsed: Math.max(Number(body.materialQuantityUsed) || 0, 0),
    packagingId: Number.isInteger(packagingId) && packagingId > 0 ? packagingId : null,
    packagingQuantityUsed: Math.max(Number(body.packagingQuantityUsed) || 0, 0),
    machineId: Number.isInteger(machineId) && machineId > 0 ? machineId : null,
    printTimeMinutes: Math.max(Math.round(Number(body.printTimeMinutes) || 0), 0),
    notes: body.notes || null
  }
}

export function productionValuesFromOrder(order, extra = {}) {
  const planned = extra.quantityPlanned || order.quantity
  return {
    date: extra.date || order.date,
    productId: null,
    customOrderId: order.id,
    machineId: extra.machineId !== undefined ? extra.machineId : order.machineId,
    quantityPlanned: planned,
    quantityGood: extra.quantityGood ?? 0,
    quantityFailed: extra.quantityFailed ?? 0,
    status: extra.status || 'queued',
    notes: extra.notes !== undefined ? extra.notes : order.notes,
    stockApplied: extra.status === 'done',
    durationMinutes: (order.printTimeMinutes || 0) * planned
  }
}

export async function hppForCustomOrder(order, { material, machine, packaging } = {}) {
  const settings = await getSettings()
  return computeHpp(
    [
      {
        materialId: order.materialId,
        quantityUsed: Number(order.materialQuantityUsed) || 0,
        printTimeMinutes: order.printTimeMinutes || 0,
        machineId: order.machineId,
        failureRatePercent: 0,
        laborMinutes: 0,
        laborRatePerHour: 0,
        material: material || null,
        machine: machine || null
      }
    ],
    order.packagingId
      ? [
          {
            packagingId: order.packagingId,
            quantityUsed: Number(order.packagingQuantityUsed) || 0,
            packaging: packaging || null
          }
        ]
      : [],
    settings
  )
}

export async function loadCustomOrderHppMap(orderIds) {
  const map = new Map()
  const ids = [...new Set(orderIds.filter(Boolean))]
  if (!ids.length) return map
  const db = useDb()
  const settings = await getSettings()
  for (const id of ids) {
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
    if (!row) continue
    map.set(id, computeHpp(
      [
        {
          materialId: row.order.materialId,
          quantityUsed: Number(row.order.materialQuantityUsed) || 0,
          printTimeMinutes: row.order.printTimeMinutes || 0,
          machineId: row.order.machineId,
          failureRatePercent: 0,
          laborMinutes: 0,
          laborRatePerHour: 0,
          material: row.material,
          machine: row.machine
        }
      ],
      row.order.packagingId
        ? [
            {
              packagingId: row.order.packagingId,
              quantityUsed: Number(row.order.packagingQuantityUsed) || 0,
              packaging: row.packaging
            }
          ]
        : [],
      settings
    ))
  }
  return map
}
