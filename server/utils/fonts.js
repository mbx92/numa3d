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

export function fontsDir() {
  const dir = join(process.cwd(), 'public', 'fonts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function listInstalledFonts() {
  const dir = fontsDir()
  return readdirSync(dir)
    .filter((name) => FONT_EXT.has(name.slice(name.lastIndexOf('.')).toLowerCase()))
    .map((filename) => {
      const full = join(dir, filename)
      const st = statSync(full)
      return {
        filename,
        url: `/fonts/${encodeURIComponent(filename)}`,
        size: st.size,
        modifiedAt: st.mtime.toISOString()
      }
    })
    .sort((a, b) => a.filename.localeCompare(b.filename))
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

const FONT_CSS_UA = 'Mozilla/5.0 (compatible; Numa3D-FontDownloader/1.1)'

export function extractFontUrl(cssText) {
  const urls = [...String(cssText).matchAll(/url\((['"]?)(https?:\/\/[^)'"\s]+)\1\)/gi)].map((m) => m[2])
  if (!urls.length) throw new Error('URL font tidak ditemukan di respons Google Fonts')
  return urls.find((u) => /\.(ttf|otf)(?:\?|$)/i.test(u))
    || urls.find((u) => /\.woff(?:\?|$)/i.test(u) && !/\.woff2/i.test(u))
    || urls[0]
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

  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': FONT_CSS_UA } })
  if (!cssRes.ok) throw new Error(`Gagal mengambil CSS font (${cssRes.status})`)

  const fontUrl = extractFontUrl(await cssRes.text())
  const fontRes = await fetch(fontUrl, { headers: { 'User-Agent': FONT_CSS_UA } })
  if (!fontRes.ok) throw new Error(`Gagal mengunduh file font (${fontRes.status})`)

  const buffer = Buffer.from(await fontRes.arrayBuffer())
  if (buffer.length < 100) throw new Error('File font kosong atau tidak valid')
  const extMatch = fontUrl.match(/\.(ttf|otf|woff2?)(?:\?|$)/i)
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.ttf'
  if (ext === '.woff2') throw new Error('Google mengirim WOFF2. Generator butuh TTF, OTF, atau WOFF — coba unduh ulang.')

  const filename = buildFilename(familyInfo.family, varKey, ext)
  return {
    buffer,
    filename,
    family: familyInfo.family,
    variantKey: varKey,
    label: `${familyInfo.family} ${variantLabel(varKey)}`
  }
}

export async function downloadGoogleFont({ family, variant }) {
  const { buffer, filename, label } = await fetchGoogleFontFile({ family, variant })
  const dest = join(fontsDir(), filename)

  if (existsSync(dest)) {
    const existing = readFileSync(dest)
    if (createHash('sha256').update(existing).digest('hex') === createHash('sha256').update(buffer).digest('hex')) {
      return {
        filename,
        url: `/fonts/${encodeURIComponent(filename)}`,
        size: buffer.length,
        skipped: true,
        label
      }
    }
  }

  writeFileSync(dest, buffer)
  return {
    filename,
    url: `/fonts/${encodeURIComponent(filename)}`,
    size: buffer.length,
    skipped: false,
    label
  }
}

export function deleteInstalledFont(filename) {
  const safe = basename(String(filename || ''))
  if (!safe || safe !== filename) throw new Error('Nama file tidak valid')
  const ext = safe.slice(safe.lastIndexOf('.')).toLowerCase()
  if (!FONT_EXT.has(ext)) throw new Error('Hanya file font yang boleh dihapus')

  const full = join(fontsDir(), safe)
  if (!existsSync(full)) throw new Error('File font tidak ditemukan')

  unlinkSync(full)
  return { ok: true, filename: safe }
}
