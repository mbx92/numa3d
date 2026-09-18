import { useDb } from '../../../../db/index.js'
import { findSlicerJob, mayManageSlicerJob, publicSlicerJob, requestSlicerCancel } from '../../../../utils/slicerQueue.js'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const id = getRouterParam(event, 'id')
  const current = await findSlicerJob(db, id)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Job slicing tidak ditemukan' })
  if (!mayManageSlicerJob(event.context.auth, current)) throw createError({ statusCode: 403, statusMessage: 'Tidak boleh membatalkan job ini' })
  const job = await requestSlicerCancel(db, id)
  if (!job) throw createError({ statusCode: 409, statusMessage: 'Job ini sudah selesai' })
  return publicSlicerJob(job)
})
