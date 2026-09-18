import { useDb } from '../../../../db/index.js'
import { findSlicerJob, mayManageSlicerJob, publicSlicerJob, retrySlicerJob } from '../../../../utils/slicerQueue.js'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')
  const current = await findSlicerJob(db, id)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Job slicing tidak ditemukan' })
  if (!mayManageSlicerJob(event.context.auth, current)) throw createError({ statusCode: 403, statusMessage: 'Tidak boleh mengulang job ini' })
  if (!['failed', 'cancelled'].includes(current.status)) throw createError({ statusCode: 409, statusMessage: 'Hanya job gagal atau batal yang dapat diulang' })
  if (current.attempts >= current.maxAttempts) throw createError({ statusCode: 409, statusMessage: 'Batas percobaan job sudah tercapai' })
  const job = await retrySlicerJob(db, id)
  if (!job) throw createError({ statusCode: 409, statusMessage: 'Hanya job gagal atau batal yang dapat diulang' })
  return publicSlicerJob(job)
})
