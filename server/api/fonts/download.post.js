import { downloadGoogleFont } from '../../utils/fonts.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const body = await readBody(event)
  const family = String(body?.family || '').trim()
  const variant = String(body?.variant || '400').trim()

  if (!family) throw createError({ statusCode: 400, statusMessage: 'Nama font wajib diisi' })

  try {
    const result = await downloadGoogleFont({ family, variant })
    await logAudit(event, {
      action: result.skipped ? 'skip' : 'create',
      entity: 'font',
      summary: result.skipped
        ? `Font sudah ada: ${result.label} (${result.filename})`
        : `Unduh font Google: ${result.label} → ${result.filename}`
    })
    return result
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: e.message || 'Gagal mengunduh font'
    })
  }
})
