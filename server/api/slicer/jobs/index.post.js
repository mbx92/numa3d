import { useDb } from '../../../db/index.js'
import { ensureBucket, minioBucket, useMinio } from '../../../utils/minio.js'
import { enqueueSlicerJob, MAX_SLICER_FILE_BYTES, publicSlicerJob } from '../../../utils/slicerQueue.js'

export default defineEventHandler(async (event) => {
  const length = Number(getHeader(event, 'content-length'))
  if (!Number.isFinite(length) || length > MAX_SLICER_FILE_BYTES + 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Ukuran unggahan maksimal 40 MB' })
  }
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  const tool = parts?.find((part) => part.name === 'tool')?.data.toString()
  const includeProfile = parts?.find((part) => part.name === 'includeProfile')?.data.toString() !== 'false'
  try {
    const rawMaterials = parts?.find((part) => part.name === 'materialIds')?.data.toString()
    let materialIds
    try { materialIds = rawMaterials ? JSON.parse(rawMaterials) : [] } catch { throw Object.assign(new Error('Pemetaan material tidak valid'), { statusCode: 400 }) }
    const job = await enqueueSlicerJob({
      db: useDb(), auth: event.context.auth, file: file?.data, filename: file?.filename, tool, includeProfile, materialIds,
      storage: {
        async put(key, bytes, contentType) {
          await ensureBucket()
          await useMinio().putObject(minioBucket(), key, bytes, bytes.length, { 'Content-Type': contentType })
        },
        remove: (key) => useMinio().removeObject(minioBucket(), key)
      }
    })
    return publicSlicerJob(job)
  } catch (error) {
    if (error.statusCode === 400) throw createError({ statusCode: 400, statusMessage: error.message })
    console.error('Failed to enqueue slicer job', error)
    throw createError({ statusCode: 500, statusMessage: 'Gagal menambahkan antrean slicing' })
  }
})
