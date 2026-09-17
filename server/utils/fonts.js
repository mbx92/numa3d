import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const FONT_EXT = new Set(['.ttf', '.otf', '.woff', '.woff2'])
const WEIGHT_NAMES = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black'
}

let catalogCache = null
let catalogFetchedAt = 0
const CATALOG_TTL_MS = 1000 * 60 * 60 * 6

/** Font populer untuk keychain / display — ditampilkan duluan saat browse tanpa pencarian. */
const POPULAR_FONTS = [
  'Barlow Condensed',
  'Roboto',
  'Oswald',
  'Bebas Neue',
  'Anton',
  'Fugaz One',
  'Montserrat',
  'Inter',
  'Poppins',
  'Russo One',
  'Black Ops One',
  'Archivo Black',
  'Teko',
  'Rajdhani',
  'Orbitron',
  'Bungee',
  'Staatliches',
  'Rubik',
  'Lato',
  'Open Sans',
  'Nunito',
  'Raleway',
  'Ubuntu',
  'Work Sans',
  'Exo 2',
  'DM Sans',
  'Kanit',
  'Chakra Petch',
  'Saira Condensed',
  'Alfa Slab One'
]

function bundledFontsDirs() {
  return [
    join(process.cwd(), '.output', 'public', 'fonts'),
    join(process.cwd(), 'public', 'fonts')
  ]
}

function isFontFilename(name) {
  return FONT_EXT.has(String(name).slice(String(name).lastIndexOf('.')).toLowerCase())
}

export function fontFileUrl(filename) {
  return `/fonts/${encodeURIComponent(filename)}`
}

/** Writable dir for downloaded fonts. Bundled fonts stay in public/fonts. */
export function fontsDir() {
  const dir = process.env.FONTS_DIR || join(process.cwd(), 'data', 'fonts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function listFontsIn(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => isFontFilename(name))
    .map((filename) => {
      const st = statSync(join(dir, filename))
      return {
        filename,
        url: fontFileUrl(filename),
        size: st.size,
        modifiedAt: st.mtime.toISOString()
      }
    })
}

export function listInstalledFonts() {
  const byName = new Map()
  for (const dir of [...bundledFontsDirs(), fontsDir()]) {
    for (const font of listFontsIn(dir)) byName.set(font.filename, font)
  }
  return [...byName.values()].sort((a, b) => a.filename.localeCompare(b.filename))
}

export function resolveFontPath(filename) {
  const safe = basename(String(filename || ''))
  if (!safe || safe !== filename || !isFontFilename(safe)) return null
  for (const dir of [fontsDir(), ...bundledFontsDirs()]) {
    const full = join(dir, safe)
    if (existsSync(full)) return full
  }
  return null
}

export function variantLabel(key) {
  const italic = String(key).endsWith('i')
  const weight = italic ? key.slice(0, -1) : key
  const name = WEIGHT_NAMES[weight] || weight
  return italic ? `${name} Italic` : name
}

function parseGoogleJson(text) {
  const cleaned = text.replace(/^\)\]\}'\n?/, '')
  return JSON.parse(cleaned)
}

async function fetchGoogleCatalog() {
  const now = Date.now()
  if (catalogCache && now - catalogFetchedAt < CATALOG_TTL_MS) return catalogCache

  const res = await fetch('https://fonts.google.com/metadata/fonts', {
    headers: { 'User-Agent': 'Numa3D-FontDownloader/1.0' }
  })
  if (!res.ok) throw new Error(`Google Fonts metadata gagal (${res.status})`)

  const data = parseGoogleJson(await res.text())
  catalogCache = (data.familyMetadataList || []).map((f) => ({
    family: f.family,
    category: f.category || '',
    variants: Object.keys(f.fonts || {}).sort()
  }))
  catalogFetchedAt = now
  return catalogCache
}

export async function searchGoogleFonts(query = '', { limit = 10, offset = 0 } = {}) {
  const q = String(query).trim().toLowerCase()
  const catalog = await fetchGoogleCatalog()
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 80)
  const off = Math.max(Number(offset) || 0, 0)

  let pool
  if (!q) {
    const byName = new Map(catalog.map((f) => [f.family.toLowerCase(), f]))
    const popular = POPULAR_FONTS.map((name) => byName.get(name.toLowerCase())).filter(Boolean)
    const popularSet = new Set(popular.map((f) => f.family))
    const rest = catalog.filter((f) => !popularSet.has(f.family))
    pool = [...popular, ...rest]
  } else {
    pool = catalog
      .map((f) => {
        const family = f.family.toLowerCase()
        let score = 0
        if (family === q) score = 100
        else if (family.startsWith(q)) score = 80
        else if (family.includes(q)) score = 60
        else if (f.category?.toLowerCase().includes(q)) score = 20
        return { ...f, score }
      })
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family))
  }

  const fonts = pool.slice(off, off + lim)
  return {
    fonts,
    total: pool.length,
    offset: off,
    limit: lim,
    hasMore: off + lim < pool.length
  }
}

export async function getGoogleFontFamily(family) {
  const name = String(family || '').trim()
  if (!name) throw new Error('Nama font wajib diisi')

  const catalog = await fetchGoogleCatalog()
  const meta = catalog.find((f) => f.family.toLowerCase() === name.toLowerCase())
  if (!meta) throw new Error(`Font "${name}" tidak ditemukan`)

  return meta
}

export function variantToCssSpec(variantKey) {
  const raw = String(variantKey || '400').trim().toLowerCase()
  const italic = raw === 'italic' || raw.endsWith('i') || raw.includes('italic')
  const weight = Number(String(variantKey).replace(/[^0-9]/g, '')) || 400
  return { italic: italic ? 1 : 0, weight }
}

function buildFilename(family, variantKey, ext) {
  const { italic, weight } = variantToCssSpec(variantKey)
  const safeFamily = family.replace(/\s+/g, '')
  const weightName = WEIGHT_NAMES[weight] || String(weight)
  const suffix = italic ? `${weightName}Italic` : weightName
  return `${safeFamily}-${suffix}${ext}`
}

const FONT_CSS_UAS = [
  'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.112 Safari/537.36',
  'Mozilla/5.0 (compatible; Numa3D-FontDownloader/1.1)'
]

export function extractFontUrl(cssText) {
  const urls = [...String(cssText).matchAll(/url\((['"]?)(https?:\/\/[^)'"\s]+)\1\)/gi)].map((m) => m[2])
  if (!urls.length) throw new Error('URL font tidak ditemukan di respons Google Fonts')
  return urls.find((u) => /\.(ttf|otf)(?:\?|$)/i.test(u))
    || urls.find((u) => /\.woff(?:\?|$)/i.test(u) && !/\.woff2/i.test(u))
    || urls[0]
}

export function fontExtFromUrl(url) {
  const match = String(url).match(/\.(ttf|otf|woff2?)(?:\?|$)/i)
  return match ? `.${match[1].toLowerCase()}` : '.ttf'
}

function isPrintableFontExt(ext) {
  return ext === '.ttf' || ext === '.otf' || ext === '.woff'
}

function networkFontError(error, fallback) {
  const code = error?.cause?.code || error?.code
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /fetch failed/i.test(String(error?.message || ''))) {
    return new Error('Server tidak bisa menghubungi Google Fonts')
  }
  return error instanceof Error ? error : new Error(fallback)
}

async function fetchCssAndFont(cssUrl, ua) {
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': ua } })
  if (!cssRes.ok) throw new Error(`Gagal mengambil CSS font (${cssRes.status})`)
  const fontUrl = extractFontUrl(await cssRes.text())
  const fontRes = await fetch(fontUrl, { headers: { 'User-Agent': ua } })
  if (!fontRes.ok) throw new Error(`Gagal mengunduh file font (${fontRes.status})`)
  const buffer = Buffer.from(await fontRes.arrayBuffer())
  if (buffer.length < 100) throw new Error('File font kosong atau tidak valid')
  const ext = fontExtFromUrl(fontUrl)
  if (!isPrintableFontExt(ext)) throw new Error('Google mengirim WOFF2. Generator butuh TTF, OTF, atau WOFF.')
  return { buffer, ext }
}

export async function fetchGoogleFontFile({ family, variant }) {
  const fam = String(family || '').trim()
  const varKey = String(variant || '400').trim()
  if (!fam) throw new Error('Nama font wajib diisi')

  const familyInfo = await getGoogleFontFamily(fam)
  if (!familyInfo.variants.includes(varKey)) {
    throw new Error(`Varian "${variantLabel(varKey)}" tidak tersedia untuk ${familyInfo.family}`)
  }

  const { italic, weight } = variantToCssSpec(varKey)
  const cssFamily = familyInfo.family.replace(/\s+/g, '+')
  const cssUrl = `https://fonts.googleapis.com/css2?family=${cssFamily}:ital,wght@${italic},${weight}&display=swap`

  let lastError
  for (const ua of FONT_CSS_UAS) {
    try {
      const { buffer, ext } = await fetchCssAndFont(cssUrl, ua)
      return {
        buffer,
        filename: buildFilename(familyInfo.family, varKey, ext),
        family: familyInfo.family,
        variantKey: varKey,
        label: `${familyInfo.family} ${variantLabel(varKey)}`
      }
    } catch (error) {
      lastError = networkFontError(error, 'Gagal mengunduh font dari Google')
    }
  }
  throw lastError || new Error('Gagal mengunduh font dari Google')
}

function mirrorDownloadedFont(filename, buffer) {
  const dir = join(process.cwd(), '.output', 'public', 'fonts')
  try {
    if (!existsSync(dir)) return
    writeFileSync(join(dir, filename), buffer)
  } catch { /* production image may be read-only */ }
}

export async function downloadGoogleFont({ family, variant }) {
  const { buffer, filename, label } = await fetchGoogleFontFile({ family, variant })
  const dest = join(fontsDir(), filename)

  if (existsSync(dest)) {
    const existing = readFileSync(dest)
    if (createHash('sha256').update(existing).digest('hex') === createHash('sha256').update(buffer).digest('hex')) {
      return { filename, url: fontFileUrl(filename), size: buffer.length, skipped: true, label }
    }
  }

  writeFileSync(dest, buffer)
  mirrorDownloadedFont(filename, buffer)
  return { filename, url: fontFileUrl(filename), size: buffer.length, skipped: false, label }
}

export function deleteInstalledFont(filename) {
  const safe = basename(String(filename || ''))
  if (!safe || safe !== filename || !isFontFilename(safe)) throw new Error('Nama file tidak valid')

  const downloaded = join(fontsDir(), safe)
  if (!existsSync(downloaded)) {
    if (resolveFontPath(safe)) throw new Error('Font bawaan tidak bisa dihapus')
    throw new Error('File font tidak ditemukan')
  }

  unlinkSync(downloaded)
  const mirror = join(process.cwd(), '.output', 'public', 'fonts', safe)
  try { if (existsSync(mirror)) unlinkSync(mirror) } catch { /* ignore */ }
  return { ok: true, filename: safe }
}
