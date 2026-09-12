import QRCode from 'qrcode/lib/core/qrcode.js'
import { QR_PLATE_ICONS } from './qrPlateIcons.js'

export const QR_PLATE_DEFAULTS = {
  label: 'QR Plate', plateLayout: 'single', contentType: 'url', content: 'https://example.com',
  wifiSsid: '', wifiPassword: '', wifiSecurity: 'WPA', wifiHidden: false,
  whatsappPayload: '', wifiCaption: 'Wi-Fi', whatsappCaption: 'WhatsApp',
  errorCorrection: 'M', qrSizeMm: 64, qrGapMm: 6, marginMm: 4, cornerRadiusMm: 4,
  baseThicknessMm: 2.4, detailHeightMm: 0.6, surfaceMode: 'raised',
  caption: '', captionHeightMm: 6, captionStrokeMm: 0, fontUrl: '/fonts/Roboto-Bold.woff', iconId: 'globe', iconSizeMm: 14,
  businessName: '', businessNameHeightMm: 6, headerLogoSvg: '', headerLogoSizeMm: 14, headerLogoGapMm: 3, headerLogoStrokeMm: 0.5,
  mounting: 'none', holeDiameterMm: 4, standStyle: 'slot', standWidthMm: 0, standDepthMm: 40,
  standThicknessMm: 5, standHeightMm: 28, standTiltDeg: 15, standClearanceMm: 0.35,
  colors: { frame: '#172a46', base: '#ffffff', detail: '#172a46', icon: '#ffffff' }
}

function number(value, fallback, min, max, label) {
  const n = value == null ? fallback : Number(value)
  if (value === '' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${label} harus ${min}–${max} mm`)
  return n
}
function choice(value, fallback, choices, label) {
  const selected = value ?? fallback
  if (!choices.includes(selected)) throw new Error(`${label} tidak valid`)
  return selected
}
const wifiEscape = (value) => String(value).replace(/[\\;,:\"]/g, '\\$&')

export function lineCaption(value, fallback = '') {
  const text = String(value ?? fallback).trim()
  if (text.length > 60 || /[\r\n\u0000-\u001f]/.test(text)) throw new Error('Tulisan maksimal 60 karakter dalam satu baris')
  return text
}

export function qrPayload(opts) {
  const type = choice(opts.contentType, 'url', ['url', 'text', 'wifi'], 'Jenis QR')
  if (type === 'wifi') {
    const ssid = String(opts.wifiSsid ?? '')
    const password = String(opts.wifiPassword ?? '')
    if (!ssid.trim()) throw new Error('Isi nama jaringan Wi-Fi')
    if (new TextEncoder().encode(ssid).length > 32) throw new Error('Nama Wi-Fi maksimal 32 byte')
    const security = choice(opts.wifiSecurity, 'WPA', ['WPA', 'WEP', 'nopass'], 'Keamanan Wi-Fi')
    if (security !== 'nopass' && !password) throw new Error('Isi kata sandi Wi-Fi')
    return `WIFI:T:${security};S:${wifiEscape(ssid)};${security !== 'nopass' ? `P:${wifiEscape(password)};` : ''}H:${opts.wifiHidden === true ? 'true' : 'false'};;`
  }
  const content = String(opts.content ?? '')
  if (!content.trim()) throw new Error('Isi konten QR terlebih dahulu')
  if (type === 'url') {
    const trimmed = content.trim()
    try {
      const url = new URL(trimmed)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error()
    } catch { throw new Error('Gunakan tautan lengkap dengan https:// atau http://') }
    return trimmed
  }
  return content
}

function luminance(color) {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
}

export function encodeQrModules(payload, errorCorrection) {
  if (new TextEncoder().encode(payload).length > 1024) throw new Error('Konten QR terlalu panjang (maksimal 1.024 byte)')
  const code = QRCode.create(payload, { errorCorrectionLevel: errorCorrection })
  const size = code.modules.size
  if (size > 97) throw new Error('QR terlalu padat untuk pelat ini — pendekkan konten atau turunkan koreksi error')
  const matrix = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => Number(code.modules.get(row, col))))
  const runs = []
  for (let row = 0; row < size; row++) for (let col = 0; col < size;) {
    if (!matrix[row][col]) { col++; continue }
    const start = col
    while (col < size && matrix[row][col]) col++
    runs.push([start, row, col - start])
  }
  return { payload, matrix, runs, size, version: code.version }
}

export function normalizeQrPlateOptions(input = {}) {
  const d = QR_PLATE_DEFAULTS
  const opts = { ...d, ...input, colors: { ...d.colors, ...input.colors } }
  for (const key of ['frame', 'base', 'detail', 'icon']) if (!/^#[\da-f]{6}$/i.test(opts.colors[key])) throw new Error('Warna harus berupa HEX enam digit')
  const light = luminance(opts.colors.base), dark = luminance(opts.colors.detail)
  if (light <= dark || (light + 0.05) / (dark + 0.05) < 4.5) throw new Error('Pilih dasar terang dan QR gelap dengan kontras lebih kuat')
  for (const [key, min, max, label] of [
    ['qrSizeMm', 25, 180, 'Ukuran QR'], ['qrGapMm', 4, 20, 'Jarak antar QR'],
    ['marginMm', 2, 12, 'Margin pelat'],
    ['cornerRadiusMm', 0, 12, 'Radius sudut'], ['baseThicknessMm', 1.2, 8, 'Ketebalan dasar'],
    ['detailHeightMm', 0.2, 2, 'Ketebalan detail'], ['captionHeightMm', 3, 14, 'Tinggi tulisan'],
    ['businessNameHeightMm', 3, 14, 'Tinggi nama usaha'],
    ['holeDiameterMm', 3, 8, 'Diameter lubang'], ['iconSizeMm', 8, 26, 'Ukuran ikon'],
    ['headerLogoSizeMm', 8, 36, 'Ukuran logo'], ['headerLogoGapMm', 0, 10, 'Jarak logo ke nama'],
    ['headerLogoStrokeMm', 0, 2, 'Tebal garis logo'], ['captionStrokeMm', 0, 1.5, 'Tebal tulisan bawah'],
    ['standWidthMm', 0, 220, 'Lebar alas'], ['standDepthMm', 28, 90, 'Kedalaman alas'],
    ['standThicknessMm', 3, 12, 'Ketebalan alas'], ['standHeightMm', 12, 70, 'Tinggi tiang'],
    ['standClearanceMm', 0.15, 1, 'Kelonggaran slot']
  ]) opts[key] = number(opts[key], d[key], min, max, label)
  opts.plateLayout = choice(opts.plateLayout, 'single', ['single', 'wifi-whatsapp'], 'Jenis pelat')
  opts.mounting = choice(opts.mounting, 'none', ['none', 'keyring', 'wall'], 'Pemasangan')
  opts.standStyle = choice(opts.standStyle, 'slot', ['none', 'slot', 'post', 'twist'], 'Dudukan')
  if (opts.mounting !== 'none') opts.standStyle = 'none'
  opts.standTiltDeg = number(opts.standTiltDeg, 15, 0, 20, 'Kemiringan (derajat)')
  opts.iconId = choice(opts.iconId, 'globe', QR_PLATE_ICONS.map((icon) => icon.id), 'Ikon')
  opts.surfaceMode = choice(opts.surfaceMode, 'raised', ['raised', 'inlay'], 'Permukaan')
  opts.errorCorrection = choice(opts.errorCorrection, 'M', ['L', 'M', 'Q', 'H'], 'Koreksi error')
  if (opts.surfaceMode === 'inlay' && opts.baseThicknessMm - opts.detailHeightMm < 0.8) throw new Error('Inlay harus menyisakan dasar minimal 0,8 mm')
  opts.caption = lineCaption(opts.caption)
  opts.businessName = lineCaption(opts.businessName)
  opts.wifiCaption = lineCaption(opts.wifiCaption, d.wifiCaption)
  opts.whatsappCaption = lineCaption(opts.whatsappCaption, d.whatsappCaption)
  opts.whatsappPayload = String(opts.whatsappPayload ?? '')
  opts.headerLogoSvg = String(opts.headerLogoSvg ?? '')
  opts.headerLogoShapes = Array.isArray(opts.headerLogoShapes) ? opts.headerLogoShapes : null
  opts.label = String(opts.label || 'QR Plate').replace(/[\u0000-\u001f]/g, ' ').slice(0, 64)
  if (opts.plateLayout === 'wifi-whatsapp') opts.iconId = 'none'
  return opts
}

function moduleMmFor(qrSizeMm, size) {
  const moduleMm = qrSizeMm / (size + 8)
  if (moduleMm < 0.6) throw new Error(`Modul QR terlalu kecil. Perbesar ukuran QR menjadi minimal ${Math.ceil((size + 8) * 0.6)} mm`)
  return moduleMm
}

function layoutColumns(opts, columns) {
  const hasCaption = columns.some((col) => col.caption)
  const hasIcon = columns.some((col) => col.iconId && col.iconId !== 'none')
  const hasHeaderLogo = !!(opts.headerLogoShapes?.length || String(opts.headerLogoSvg || '').trim())
  const hasBusinessName = !!opts.businessName
  const standEnabled = opts.standStyle !== 'none'
  const insertionBandMm = standEnabled ? 12 : 0
  const iconBandMm = hasIcon ? opts.iconSizeMm + 8 : 0
  const textBandMm = hasCaption ? opts.captionHeightMm + 5 : 0
  const captionBandMm = textBandMm + iconBandMm + insertionBandMm
  const logoBandMm = hasHeaderLogo ? opts.headerLogoSizeMm + 4 : 0
  const nameBandMm = hasBusinessName ? opts.businessNameHeightMm + 5 : 0
  const headerGapMm = hasHeaderLogo && hasBusinessName ? opts.headerLogoGapMm : 0
  const headerBandMm = logoBandMm + nameBandMm + headerGapMm
  const mountBandMm = opts.mounting === 'none' ? 0 : opts.holeDiameterMm + 6
  const count = columns.length
  const gapMm = count > 1 ? opts.qrGapMm : 0
  const widthMm = opts.qrSizeMm * count + gapMm * Math.max(0, count - 1) + opts.marginMm * 2
  const depthMm = opts.qrSizeMm + opts.marginMm * 2 + captionBandMm + headerBandMm + mountBandMm
  const qrCenterY = (captionBandMm - mountBandMm - headerBandMm) / 2
  const iconCenterY = -depthMm / 2 + opts.marginMm + insertionBandMm + textBandMm + iconBandMm / 2
  const captionCenterY = -depthMm / 2 + opts.marginMm + insertionBandMm + (hasCaption ? textBandMm / 2 : 0)
  const headerTop = depthMm / 2 - mountBandMm
  const headerLogoCenterY = hasHeaderLogo ? headerTop - logoBandMm / 2 : 0
  const businessNameCenterY = hasBusinessName ? headerTop - logoBandMm - headerGapMm - nameBandMm / 2 : 0
  const codes = columns.map((col, i) => {
    const moduleMm = moduleMmFor(opts.qrSizeMm, col.size)
    const centerX = -widthMm / 2 + opts.marginMm + opts.qrSizeMm / 2 + i * (opts.qrSizeMm + gapMm)
    return {
      id: col.id, payload: col.payload, matrix: col.matrix, runs: col.runs,
      size: col.size, version: col.version, moduleMm, centerX, centerY: qrCenterY,
      iconId: col.iconId, caption: col.caption, iconCenterY, captionCenterY
    }
  })
  const standWidthMm = opts.standWidthMm || Math.max(widthMm + 8, 50)
  if (standEnabled && standWidthMm < Math.min(widthMm * 0.7, 60)) throw new Error('Alas terlalu sempit untuk pelat — perbesar lebar alas')
  const tiltDeg = opts.standStyle === 'slot' ? opts.standTiltDeg : 0
  const stand = standEnabled ? {
    widthMm: standWidthMm, depthMm: opts.standDepthMm, thicknessMm: opts.standThicknessMm,
    tiltDeg, columnHeightMm: opts.standStyle === 'slot' ? 0 : opts.standHeightMm,
    cradleWidthMm: Math.min(widthMm * 0.6, 42), cradleDepthMm: opts.baseThicknessMm + opts.standClearanceMm + 8 + 10 * Math.tan(tiltDeg * Math.PI / 180),
    slotFloorZ: opts.standThicknessMm + (opts.standStyle === 'slot' ? 0 : opts.standHeightMm),
    cradleHeightMm: 10
  } : null
  const holes = opts.mounting === 'none' ? [] : opts.mounting === 'keyring'
    ? [[0, depthMm / 2 - mountBandMm / 2]]
    : [[-widthMm / 2 + opts.marginMm + opts.holeDiameterMm / 2, depthMm / 2 - mountBandMm / 2], [widthMm / 2 - opts.marginMm - opts.holeDiameterMm / 2, depthMm / 2 - mountBandMm / 2]]
  const warnings = []
  if (codes.some((code) => code.moduleMm < 0.8)) warnings.push('Modul QR di bawah 0,8 mm. Periksa resolusi cetak dan hasil pemindaian.')
  if (widthMm > 240) warnings.push('Pelat lebih dari 240 mm. Perkecil ukuran QR agar muat di plate cetak.')
  const first = codes[0]
  return {
    opts, codes, payload: first.payload, matrix: first.matrix, runs: first.runs, size: first.size,
    version: first.version, moduleMm: first.moduleMm, widthMm, depthMm, captionBandMm, headerBandMm, mountBandMm,
    qrCenterY, holes, stand, insertionBandMm, iconBandMm, iconCenterY, captionCenterY,
    headerLogoCenterY, businessNameCenterY, hasHeaderLogo, hasBusinessName,
    cornerRadiusMm: Math.min(opts.cornerRadiusMm, opts.marginMm, widthMm / 2, depthMm / 2),
    warnings
  }
}

/** QR and every output use this same matrix. Four quiet modules are reserved. */
export function createQrPlateDesign(input = {}) {
  const opts = normalizeQrPlateOptions(input)
  if (opts.plateLayout === 'wifi-whatsapp') {
    const wifi = encodeQrModules(qrPayload({ ...opts, contentType: 'wifi' }), opts.errorCorrection)
    const raw = String(opts.whatsappPayload || '').trim()
    if (!raw) throw new Error('Unggah QR WhatsApp (JPEG dari WhatsApp)')
    const whatsapp = encodeQrModules(raw, opts.errorCorrection)
    const design = layoutColumns(opts, [
      { id: 'wifi', iconId: 'wifi', caption: opts.wifiCaption, ...wifi },
      { id: 'whatsapp', iconId: 'whatsapp', caption: opts.whatsappCaption, ...whatsapp }
    ])
    if (!/wa\.me|whatsapp\.com|whatsapp:/i.test(raw)) {
      design.warnings.push('QR terunggah bukan tautan WhatsApp. Periksa file sebelum mencetak.')
    }
    return design
  }
  const encoded = encodeQrModules(qrPayload(opts), opts.errorCorrection)
  return layoutColumns(opts, [{ id: 'main', iconId: opts.iconId, caption: opts.caption, ...encoded }])
}

export function qrPlateSvg(design) {
  const { opts, codes } = design
  const gap = codes.length > 1 ? 8 : 0
  const cells = codes.map((code) => {
    const path = code.runs.map(([x, y, width]) => `M${x + 4} ${y + 4}h${width}v1h-${width}z`).join('')
    const box = code.size + 8
    return `<svg x="0" width="${opts.qrSizeMm}" height="${opts.qrSizeMm}" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${opts.colors.base}"/><path d="${path}" fill="${opts.colors.detail}"/></svg>`
  })
  if (codes.length === 1) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.qrSizeMm}mm" height="${opts.qrSizeMm}mm" viewBox="0 0 ${opts.qrSizeMm} ${opts.qrSizeMm}">${cells[0]}</svg>`
  }
  const width = opts.qrSizeMm * codes.length + gap * (codes.length - 1)
  const parts = cells.map((cell, i) => `<g transform="translate(${i * (opts.qrSizeMm + gap)},0)">${cell}</g>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${opts.qrSizeMm}mm" viewBox="0 0 ${width} ${opts.qrSizeMm}" shape-rendering="crispEdges">${parts.join('')}</svg>`
}
