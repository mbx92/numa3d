import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { publicMachine, tuyaFieldsFromBody } from '../../utils/tuyaLocal.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  if (!body.name) throw createError({ statusCode: 400, statusMessage: 'Nama wajib diisi' })
  const db = useDb()
  const rows = await db
    .insert(schema.machines)
    .values({
      name: body.name,
      powerWatt: Math.round(Number(body.powerWatt) || 0),
      purchasePrice: Math.round(Number(body.purchasePrice) || 0),
      purchaseDate: body.purchaseDate || null,
      depreciationMonths: Math.round(Number(body.depreciationMonths) || 36),
      notes: body.notes || null,
      ...tuyaFieldsFromBody(body, null)
    })
    .returning()
  await logAudit(event, { action: 'create', entity: 'machine', entityId: rows[0].id, summary: `Tambah mesin "${rows[0].name}"` })
  return publicMachine(rows[0])
})
