import { validateSlicerUpload, MAX_SLICER_FILE_BYTES } from '../../utils/slicerQueue.js'
import { inspectCustomModel } from '../../utils/customModelMaterials.js'
export default defineEventHandler(async (event) => {
  if (Number(getHeader(event, 'content-length')) > MAX_SLICER_FILE_BYTES + 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Ukuran unggahan maksimal 40 MB' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  try {
    const input = validateSlicerUpload({ file: file?.data, filename: file?.filename, tool: 'custom-order' })
    return inspectCustomModel(input.file, input.format)
  } catch (error) { throw createError({ statusCode: error.statusCode || 400, statusMessage: error.message }) }
})
