import { searchGoogleFonts } from '../../utils/fonts.js'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 80)
  const offset = Math.max(Number(query.offset) || 0, 0)
  return searchGoogleFonts(q, { limit, offset })
})
