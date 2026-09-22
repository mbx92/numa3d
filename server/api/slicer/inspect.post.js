import { validateSlicerUpload, MAX_SLICER_FILE_BYTES } from '../../utils/slicerQueue.js'
import { inspectCustomModel } from '../../utils/customModelMaterials.js'
export default defineEventHandler(async (event) => {
  if (Number(getHeader(event, 'content-length')) > MAX_SLICER_FILE_BYTES + 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Ukuran unggahan maksimal 40 MB' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  const rawPlate = parts?.find((part) => part.name === 'selectedPlate')?.data.toString()
  const rawPlates = parts?.find((part) => part.name === 'selectedPlates')?.data.toString()
  try {
    const input = validateSlicerUpload({ file: file?.data, filename: file?.filename, tool: 'custom-order' })
    const selectedPlate = rawPlate == null ? null : Number(rawPlate)
    if (selectedPlate != null && (!Number.isSafeInteger(selectedPlate) || selectedPlate <= 0)) throw Object.assign(new Error('Pilihan plate tidak valid'), { statusCode: 400 })
    let selection = selectedPlate
    if (rawPlates != null) {
      try { selection = JSON.parse(rawPlates) } catch { throw Object.assign(new Error('Pilihan plate tidak valid'), { statusCode: 400 }) }
    }
    return inspectCustomModel(input.file, input.format, selection)
  } catch (error) { throw createError({ statusCode: error.statusCode || 400, statusMessage: error.message }) }
})
