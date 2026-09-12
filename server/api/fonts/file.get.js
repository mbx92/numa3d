import { fetchGoogleFontFile } from '../../utils/fonts.js'

const MIME = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff'
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const family = String(query.family || '').trim()
  const variant = String(query.variant || '400').trim()
  if (!family) throw createError({ statusCode: 400, statusMessage: 'Nama font wajib diisi' })

  try {
    const { buffer, filename } = await fetchGoogleFontFile({ family, variant })
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    setResponseHeaders(event, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, max-age=86400'
    })
    return send(event, buffer)
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: e.message || 'Gagal mengunduh font'
    })
  }
})
