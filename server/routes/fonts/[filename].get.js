import { readFileSync } from 'node:fs'
import { getDownloadedFont, resolveFontPath } from '../../utils/fonts.js'

const MIME = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

export default defineEventHandler(async (event) => {
  const filename = decodeURIComponent(getRouterParam(event, 'filename') || '')
  const downloaded = await getDownloadedFont(filename)
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  if (downloaded) {
    setResponseHeaders(event, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400'
    })
    return sendStream(event, downloaded)
  }

  const full = resolveFontPath(filename)
  if (!full) throw createError({ statusCode: 404, statusMessage: 'Font tidak ditemukan' })
  const buffer = readFileSync(full)
  setResponseHeaders(event, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400'
  })
  return send(event, buffer)
})
