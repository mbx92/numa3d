import { eq } from 'drizzle-orm'
import { useDb, schema } from '../db/index.js'
import { getSettings } from '../utils/settings.js'
import { requireAdmin } from '../utils/rbac.js'
import { logAudit } from '../utils/audit.js'
import { clampShareTtlDays } from '../utils/invoice.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  const current = await getSettings()
  const db = useDb()
  const rows = await db
    .update(schema.appSettings)
    .set({
      electricityRatePerKwh: Math.round(Number(body.electricityRatePerKwh) || 1445),
      machineUsageHoursPerMonth: Math.max(Math.round(Number(body.machineUsageHoursPerMonth) || 100), 1),
      defaultMarginPercent: Number(body.defaultMarginPercent) || 40,
      invoiceBusinessName: String(body.invoiceBusinessName || '').trim() || 'Numa3D',
      invoiceAddress: String(body.invoiceAddress || '').trim() || null,
      invoicePhone: String(body.invoicePhone || '').trim() || null,
      invoiceFooter: String(body.invoiceFooter || '').trim() || null,
      invoiceShareTtlDays: clampShareTtlDays(body.invoiceShareTtlDays)
    })
    .where(eq(schema.appSettings.id, current.id))
    .returning()
  await logAudit(event, { action: 'update', entity: 'settings', entityId: current.id, summary: 'Ubah pengaturan HPP (tarif listrik/pemakaian mesin/margin default)' })
  return rows[0]
})
