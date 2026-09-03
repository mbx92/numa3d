/**
 * Saran potongan mesh otomatis (figur seperti kaktus-in-pot).
 * - Multi-body 3MF → lid = bagian atas, base = bawah
 * - Satu solid → cari “pinggang” / lonjakan lebar XY sepanjang Z
 */
import { meshBounds } from './threemfImport.js'
import { orientMeshToZUp, parseMeshBuffer, meshFileExt, rawMeshToStlBuffer } from './meshImport.js'
import { parse3MFMeshes } from './threemfImport.js'

const DEFAULT_REGION = { u: 0.5, v: 0.5, wu: 1, wv: 1 }

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

/** Histogram radius/lebar XY per slice Z (setelah orient Z-up). */
export function analyzeMeshHeightProfile(raw, binCount = 56) {
  const b = meshBounds(raw)
  const h = Math.max(b.height, 0.001)
  const bins = Math.max(16, Math.min(128, binCount))
  const stats = Array.from({ length: bins }, () => ({
    count: 0,
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    maxR2: 0
  }))
  const vp = raw.vertProperties
  const np = raw.numProp || 3
  const tris = raw.triVerts
  const cx = b.centerX
  const cy = b.centerY

  function touchBin(bi, x, y) {
    if (bi < 0 || bi >= bins) return
    const s = stats[bi]
    s.count++
    s.minX = Math.min(s.minX, x)
    s.maxX = Math.max(s.maxX, x)
    s.minY = Math.min(s.minY, y)
    s.maxY = Math.max(s.maxY, y)
    const dx = x - cx
    const dy = y - cy
    const r2 = dx * dx + dy * dy
    if (r2 > s.maxR2) s.maxR2 = r2
  }

  // Setiap segitiga mengisi semua bin Z yang dilaluinya (penting untuk mesh sparse/CAD)
  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t] * np
    const i1 = tris[t + 1] * np
    const i2 = tris[t + 2] * np
    const xs = [vp[i0], vp[i1], vp[i2]]
    const ys = [vp[i0 + 1], vp[i1 + 1], vp[i2 + 1]]
    const zs = [vp[i0 + 2], vp[i1 + 2], vp[i2 + 2]]
    const zMin = Math.min(zs[0], zs[1], zs[2])
    const zMax = Math.max(zs[0], zs[1], zs[2])
    let b0 = Math.floor(((zMin - b.minZ) / h) * bins)
    let b1 = Math.floor(((zMax - b.minZ) / h) * bins)
    if (b0 < 0) b0 = 0
    if (b1 >= bins) b1 = bins - 1
    if (b0 > b1) continue
    for (let bi = b0; bi <= b1; bi++) {
      touchBin(bi, xs[0], ys[0])
      touchBin(bi, xs[1], ys[1])
      touchBin(bi, xs[2], ys[2])
    }
  }

  return stats.map((s, i) => {
    const z0 = b.minZ + (i / bins) * h
    const z1 = b.minZ + ((i + 1) / bins) * h
    const empty = s.count < 1
    const width = empty ? 0 : s.maxX - s.minX
    const depth = empty ? 0 : s.maxY - s.minY
    const extent = empty ? 0 : Math.max(width, depth, Math.sqrt(s.maxR2) * 2)
    return {
      i,
      zMid: (z0 + z1) / 2,
      t: (i + 0.5) / bins,
      count: s.count,
      extent,
      width,
      depth
    }
  })
}

/**
 * Cari tinggi potong ideal:
 * 1) Lonjakan lebar saat turun dari puncak (masuk ke pot yang lebih lebar)
 * 2) Atau minimum lokal extent di zona tengah-bawah
 */
export function suggestCutFromProfile(profile, bounds) {
  const h = Math.max(bounds.height, 0.001)
  const filled = profile.filter((p) => p.count >= 1 && p.extent > 0.01)
  if (filled.length < 8) {
    return {
      lidRatio: 0.32,
      cutZ: bounds.maxZ - h * 0.32,
      confidence: 0.2,
      reason: 'Profil mesh tipis — pakai default 32%'
    }
  }

  // Scan dari atas ke bawah: cari lonjakan extent terbesar (kaktus → rim pot)
  let bestJump = null
  for (let i = filled.length - 1; i >= 2; i--) {
    const above = filled[i]
    const below = filled[i - 1]
    if (above.t < 0.2 || above.t > 0.95) continue
    if (below.t < 0.05) continue
    const jump = below.extent - above.extent
    const rel = jump / Math.max(above.extent, 0.5)
    if (jump > 0 && rel > 0.1) {
      if (!bestJump || rel > bestJump.rel) {
        bestJump = { below, above, jump, rel, t: below.t }
      }
    }
  }

  if (bestJump && bestJump.rel >= 0.15) {
    // Potong sedikit di atas pelebatan (masih di batang / di rim)
    const cutZ = bestJump.above.zMid * 0.35 + bestJump.below.zMid * 0.65
    const lidRatio = clamp((bounds.maxZ - cutZ) / h, 0.12, 0.7)
    return {
      lidRatio,
      cutZ,
      confidence: clamp(0.5 + bestJump.rel * 0.35, 0.55, 0.95),
      reason: 'Terdeteksi pelebatan ke pot/alas (lonjakan lebar XY)',
      method: 'extent-jump'
    }
  }

  // Fallback: minimum lokal extent di 18%–65% tinggi dari bawah
  let bestMin = null
  for (let i = 2; i < filled.length - 2; i++) {
    const p = filled[i]
    if (p.t < 0.18 || p.t > 0.65) continue
    const prev = filled[i - 1]
    const next = filled[i + 1]
    const isLocalMin = p.extent <= prev.extent && p.extent <= next.extent
    if (!isLocalMin) continue
    if (!bestMin || p.extent < bestMin.extent) bestMin = p
  }

  if (bestMin) {
    const lidRatio = clamp((bounds.maxZ - bestMin.zMid) / h, 0.12, 0.7)
    return {
      lidRatio,
      cutZ: bestMin.zMid,
      confidence: 0.55,
      reason: 'Terdeteksi pinggang mesh (lebar XY minimum)',
      method: 'local-min'
    }
  }

  // Heuristik figur: potong di ~38% dari bawah jika bawah lebih lebar dari atas
  const low = filled.filter((p) => p.t < 0.35)
  const high = filled.filter((p) => p.t > 0.65)
  const avg = (arr) => arr.reduce((s, p) => s + p.extent, 0) / Math.max(arr.length, 1)
  if (low.length && high.length && avg(low) > avg(high) * 1.15) {
    const cutZ = bounds.minZ + h * 0.42
    return {
      lidRatio: clamp((bounds.maxZ - cutZ) / h, 0.12, 0.7),
      cutZ,
      confidence: 0.4,
      reason: 'Bawah lebih lebar dari atas — potong di zona transisi',
      method: 'wide-base'
    }
  }

  return {
    lidRatio: 0.32,
    cutZ: bounds.maxZ - h * 0.32,
    confidence: 0.25,
    reason: 'Tidak ada pinggang jelas — default 32%',
    method: 'default'
  }
}

/** Bandingkan dua mesh: yang pusat Z lebih tinggi → lid. */
export function rankMeshesAsLidBase(meshes) {
  const scored = meshes.map((raw, index) => {
    const b = meshBounds(raw)
    return {
      index,
      raw,
      bounds: b,
      centerZ: b.centerZ,
      height: b.height,
      volumeProxy: b.width * b.depth * b.height
    }
  })
  scored.sort((a, c) => c.centerZ - a.centerZ || c.height - a.height)
  if (scored.length < 2) return null
  const lid = scored[0]
  const base = scored[scored.length - 1]
  if (lid.index === base.index) return null
  // Harus ada jarak vertikal yang berarti
  const gap = lid.bounds.minZ - base.bounds.maxZ
  const overlap = Math.min(lid.bounds.maxZ, base.bounds.maxZ) - Math.max(lid.bounds.minZ, base.bounds.minZ)
  const stacked = gap >= -0.5 * Math.min(lid.height, base.height) || overlap < 0.55 * Math.min(lid.height, base.height)
  if (!stacked && Math.abs(lid.centerZ - base.centerZ) < 0.15 * Math.max(lid.height, base.height)) {
    // Berdampingan — bukan atas/bawah
    return null
  }
  return { lid: lid.raw, base: base.raw, lidBounds: lid.bounds, baseBounds: base.bounds }
}

/**
 * Analisis penuh dari buffer file.
 * @returns {{
 *   mode: 'parts'|'split',
 *   lidRatio: number,
 *   region: {u,v,wu,wv},
 *   upAxis: string,
 *   remapped: boolean,
 *   confidence: number,
 *   reason: string,
 *   lidRaw?: object,
 *   baseRaw?: object,
 *   orientedRaw: object
 * }}
 */
export function suggestMeshClickerSplit(buf, filename = '', upAxis = 'auto') {
  const ext = meshFileExt(filename)

  // Multi-mesh 3MF
  if (ext === '3mf' || !ext) {
    try {
      const { meshes } = parse3MFMeshes(buf.slice(0))
      if (meshes.length >= 2) {
        const oriented = meshes.map((m) => orientMeshToZUp(m, upAxis))
        const ranked = rankMeshesAsLidBase(oriented.map((o) => o.raw))
        if (ranked) {
          return {
            mode: 'parts',
            lidRatio: 0,
            region: { ...DEFAULT_REGION },
            upAxis: oriented[0].upAxis,
            remapped: oriented.some((o) => o.remapped),
            confidence: 0.9,
            reason: `3MF punya ${meshes.length} body — dipisah otomatis jadi lid+base`,
            lidRaw: ranked.lid,
            baseRaw: ranked.base,
            lidBuffer: rawMeshToStlBuffer(ranked.lid),
            baseBuffer: rawMeshToStlBuffer(ranked.base),
            orientedRaw: ranked.base,
            method: 'multi-body'
          }
        }
      }
    } catch {
      // fallback ke parse tunggal
    }
  }

  const parsed = parseMeshBuffer(buf.slice(0), filename)
  const { raw, upAxis: detectedAxis, remapped } = orientMeshToZUp(parsed, upAxis)
  const bounds = meshBounds(raw)
  const profile = analyzeMeshHeightProfile(raw)
  const cut = suggestCutFromProfile(profile, bounds)

  // Wilayah: di sekitar cut, pakai footprint slice (sering lebih sempit dari pot)
  let region = { ...DEFAULT_REGION }
  const near = profile.filter((p) => Math.abs(p.zMid - cut.cutZ) <= bounds.height * 0.06 && p.count >= 3)
  if (near.length) {
    // Full split biasanya terbaik untuk kaktus↔pot; tetap 100% agar lengan tidak putus.
    region = { ...DEFAULT_REGION }
  }

  return {
    mode: 'split',
    lidRatio: cut.lidRatio,
    region,
    upAxis: detectedAxis,
    remapped,
    confidence: cut.confidence,
    reason: cut.reason,
    orientedRaw: raw,
    method: cut.method || 'profile',
    cutZ: cut.cutZ,
    bounds
  }
}
