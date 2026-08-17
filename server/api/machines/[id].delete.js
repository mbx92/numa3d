import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'
import { deleteLinkedMachineExpense } from '../../utils/machineExpense.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const [existing] = await db.select().from(schema.machines).where(eq(schema.machines.id, id))
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Mesin tidak ditemukan' })
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.machines).where(eq(schema.machines.id, id))
      await deleteLinkedMachineExpense(tx, schema, existing.expenseId)
    })
  } catch (e) {
    if (e.statusCode) throw e
    throw createError({
      statusCode: 409,
      statusMessage: 'Mesin dipakai di recipe produk, tidak bisa dihapus'
    })
  }
  await logAudit(event, { action: 'delete', entity: 'machine', entityId: id, summary: `Hapus mesin "${existing.name}"` })
  return { ok: true }
})
