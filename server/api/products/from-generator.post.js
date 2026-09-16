import { useDb } from '../../db/index.js'
import { requireAdmin } from '../../utils/rbac.js'
import { ensureBucket, minioBucket, useMinio } from '../../utils/minio.js'
import { saveGeneratorProduct } from '../../utils/generatorProduct.js'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const length = Number(getHeader(event, 'content-length'))
  if (!Number.isFinite(length) || length > 41 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Ukuran unggahan maksimal 40 MB' })
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file' && part.filename)
  const productPart = parts?.find((part) => part.name === 'product')
  let input
  try {
    if (!productPart || productPart.data.length > 16384) throw new Error()
    input = JSON.parse(productPart.data.toString())
  } catch { throw createError({ statusCode: 400, statusMessage: 'Data produk tidak valid' }) }
  try {
    return await saveGeneratorProduct({
      db: useDb(), auth: event.context.auth, input, file: file?.data,
      storage: {
        async put(key, bytes) {
          await ensureBucket()
          await useMinio().putObject(minioBucket(), key, bytes, bytes.length, { 'Content-Type': 'model/3mf' })
        },
        remove: (key) => useMinio().removeObject(minioBucket(), key)
      }
    })
  } catch (error) {
    if (error.statusCode === 400) throw createError({ statusCode: 400, statusMessage: error.message })
    console.error('Failed to save generator product', error)
    throw createError({ statusCode: 500, statusMessage: 'Gagal menyimpan produk. Silakan coba lagi.' })
  }
})
