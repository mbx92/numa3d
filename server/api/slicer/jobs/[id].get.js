import { useDb } from '../../../db/index.js'
import { findSlicerJob, mayManageSlicerJob, publicSlicerJob } from '../../../utils/slicerQueue.js'

export default defineEventHandler(async (event) => {
  const job = await findSlicerJob(useDb(), getRouterParam(event, 'id'))
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job slicing tidak ditemukan' })
  if (!mayManageSlicerJob(event.context.auth, job)) throw createError({ statusCode: 403, statusMessage: 'Tidak boleh melihat job ini' })
  return publicSlicerJob(job)
})
