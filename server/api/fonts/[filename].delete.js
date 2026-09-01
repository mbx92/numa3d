import { deleteInstalledFont } from '../../utils/fonts.js'
import { requireAdmin } from '../../utils/rbac.js'
import { logAudit } from '../../utils/audit.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const filename = getRouterParam(event, 'filename')
  if (!filename) throw createError({ statusCode: 400, statusMessage: 'Nama file wajib diisi' })

  try {
    const result = deleteInstalledFont(filename)
    await logAudit(event, {
      action: 'delete',
      entity: 'font',
      summary: `Hapus font lokal "${result.filename}"`
    })
    return result
  } catch (e) {
    throw createError({
      statusCode: e.message === 'File font tidak ditemukan' ? 404 : 400,
      statusMessage: e.message || 'Gagal menghapus font'
    })
  }
})
