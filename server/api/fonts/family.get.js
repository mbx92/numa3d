import { getGoogleFontFamily } from '../../utils/fonts.js'

export default defineEventHandler(async (event) => {
  const family = String(getQuery(event).family || '').trim()
  if (!family) throw createError({ statusCode: 400, statusMessage: 'Parameter family wajib diisi' })
  return getGoogleFontFamily(family)
})
