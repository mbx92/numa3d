import { eq } from 'drizzle-orm'
import { localDateStr } from './dates.js'

const MACHINE_CATEGORY = 'machine'

function expensePayload(machine) {
  return {
    date: machine.purchaseDate || localDateStr(),
    category: MACHINE_CATEGORY,
    description: `Pembelian mesin: ${machine.name}`,
    amount: Math.round(Number(machine.purchasePrice) || 0)
  }
}

export async function syncMachinePurchaseExpense(tx, schema, machine) {
  const payload = expensePayload(machine)
  if (payload.amount <= 0) {
    if (machine.expenseId) {
      await tx.delete(schema.expenses).where(eq(schema.expenses.id, machine.expenseId))
      const [updated] = await tx
        .update(schema.machines)
        .set({ expenseId: null })
        .where(eq(schema.machines.id, machine.id))
        .returning()
      return updated
    }
    return machine
  }

  if (machine.expenseId) {
    await tx.update(schema.expenses).set(payload).where(eq(schema.expenses.id, machine.expenseId))
    return machine
  }

  const [expense] = await tx.insert(schema.expenses).values(payload).returning()
  const [updated] = await tx
    .update(schema.machines)
    .set({ expenseId: expense.id })
    .where(eq(schema.machines.id, machine.id))
    .returning()
  return updated
}

export async function deleteLinkedMachineExpense(tx, schema, expenseId) {
  if (!expenseId) return
  await tx.delete(schema.expenses).where(eq(schema.expenses.id, expenseId))
}

export async function assertNotMachineLinkedExpense(db, schema, expenseId) {
  const [row] = await db
    .select({ id: schema.machines.id, name: schema.machines.name })
    .from(schema.machines)
    .where(eq(schema.machines.expenseId, expenseId))
  if (row) {
    throw createError({
      statusCode: 409,
      statusMessage: `Pengeluaran ini dari mesin "${row.name}". Ubah atau hapus lewat halaman Mesin.`
    })
  }
}
