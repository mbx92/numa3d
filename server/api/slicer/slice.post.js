import { sliceGenerator3mf, computeSlicerHpp } from '../../utils/orcaSlicer.js'

export default defineEventHandler(async (event) => {
  // Authentication is enforced by server/middleware/auth.js. This only estimates; it never starts a printer.
  const length = Number(getHeader(event, 'content-length'))
  if (!Number.isFinite(length) || length > 41 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Ukuran unggahan maksimal 40 MB' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  const tool = parts?.find((part) => part.name === 'tool')?.data.toString()
  const includeProfile = parts?.find((part) => part.name === 'includeProfile')?.data.toString() !== 'false'
  if (!file) throw createError({ statusCode: 400, statusMessage: 'File 3MF wajib disertakan' })
  try {
    const costsRaw = parts?.find((part) => part.name === 'costs')?.data.toString()
    const slice = await sliceGenerator3mf(file.data, { tool, includeProfile })
    if (!costsRaw) return slice
    const costs = JSON.parse(costsRaw)
    if (!costs || typeof costs !== 'object' || Array.isArray(costs)) throw new Error('Asumsi biaya tidak valid')
    return { ...slice, hpp: computeSlicerHpp(slice, costs) }
  }
  catch (error) { throw createError({ statusCode: error.statusCode || 422, statusMessage: error.message }) }
})
