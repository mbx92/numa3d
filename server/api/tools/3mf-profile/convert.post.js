import { convertProfile3mf, MAX_PROFILE_3MF_BYTES } from '../../../utils/profile3mf.js'
import { useDb } from '../../../db/index.js'
import { inspectCustomModel, resolveCustomMaterials } from '../../../utils/customModelMaterials.js'

export default defineEventHandler(async (event) => {
  const length = Number(getHeader(event, 'content-length'))
  if (!Number.isFinite(length) || length > MAX_PROFILE_3MF_BYTES + 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Ukuran file 3MF maksimal 40 MB' })
  }
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  try {
    const rawMaterials = parts?.find((part) => part.name === 'materialIds')?.data.toString()
    let materialIds
    try { materialIds = rawMaterials ? JSON.parse(rawMaterials) : [] }
    catch { throw Object.assign(new Error('Pemetaan material tidak valid'), { statusCode: 400 }) }
    const inputConfig = await resolveCustomMaterials(useDb(), inspectCustomModel(file?.data, '3mf'), materialIds)
    const result = await convertProfile3mf(file?.data, file?.filename, inputConfig)
    setResponseHeaders(event, {
      'Content-Type': 'model/3mf',
      'Content-Length': String(result.bytes.length),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      'Cache-Control': 'no-store'
    })
    return send(event, result.bytes)
  } catch (error) {
    throw createError({ statusCode: error.statusCode || 400, statusMessage: error.message || 'Gagal mengonversi file 3MF' })
  }
})
