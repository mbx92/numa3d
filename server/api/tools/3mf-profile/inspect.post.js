import { inspectProfile3mf, MAX_PROFILE_3MF_BYTES } from '../../../utils/profile3mf.js'

export default defineEventHandler(async (event) => {
  const length = Number(getHeader(event, 'content-length'))
  if (!Number.isFinite(length) || length > MAX_PROFILE_3MF_BYTES + 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Ukuran file 3MF maksimal 40 MB' })
  }
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  try {
    return inspectProfile3mf(file?.data, file?.filename)
  } catch (error) {
    throw createError({ statusCode: error.statusCode || 400, statusMessage: error.message || 'Gagal memeriksa file 3MF' })
  }
})
