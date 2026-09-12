import { readFileSync } from 'node:fs'
import { resolveFontPath } from '../../utils/fonts.js'

const MIME = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

export default defineEventHandler((event) => {
  const filename = decodeURIComponent(getRouterParam(event, 'filename') || '')
  const full = resolveFontPath(filename)
  if (!full) throw createError({ statusCode: 404, statusMessage: 'Font tidak ditemukan' })
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  const buffer = readFileSync(full)
  setResponseHeaders(event, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400'
  })
  return send(event, buffer)
})
