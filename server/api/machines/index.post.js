import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { publicMachine, tuyaFieldsFromBody } from '../../utils/tuyaLocal.js'
import { syncMachinePurchaseExpense } from '../../utils/machineExpense.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body.name) throw createError({ statusCode: 400, statusMessage: 'Nama wajib diisi' })
  const db = useDb()
  const machine = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.machines)
      .values({
        name: body.name,
        powerWatt: Math.round(Number(body.powerWatt) || 0),
        purchasePrice: Math.round(Number(body.purchasePrice) || 0),
        purchaseDate: body.purchaseDate || null,
        depreciationMonths: Math.round(Number(body.depreciationMonths) || 36),
        bedWidthMm: Math.max(Math.round(Number(body.bedWidthMm) || 220), 1),
        bedDepthMm: Math.max(Math.round(Number(body.bedDepthMm) || 220), 1),
        buildHeightMm: Math.max(Math.round(Number(body.buildHeightMm) || 250), 1),
        notes: body.notes || null,
        ...tuyaFieldsFromBody(body, null)
      })
      .returning()
    return syncMachinePurchaseExpense(tx, schema, row)
  })
  await logAudit(event, { action: 'create', entity: 'machine', entityId: machine.id, summary: `Tambah mesin "${machine.name}"` })
  return publicMachine(machine)
})
