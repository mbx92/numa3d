const ROLE_LABELS = {
  base: 'Base',
  lid: 'Lid / cap',
  switch: 'Switch',
  letter: 'Teks',
  accent: 'Aksen',
  plateInner: 'Plate dalam',
  plateOuter: 'Plate luar',
  rim: 'Rim',
  cavityWall: 'Dinding cavity',
  bottomCap: 'Tutup bawah',
  frame: 'Frame',
  back: 'Panel belakang',
  stand: 'Stand',
  ledGlow: 'Cahaya LED',
  ledChip: 'LED chip',
  diffuser: 'Diffuser',
  background: 'Background',
  color: 'Layer warna'
}

export function partLabel(role, name) {
  if (name && !/[_]/.test(name)) return name
  if (role && ROLE_LABELS[role]) return ROLE_LABELS[role]
  if (name) return name.replace(/_/g, ' ')
  return role || 'Part'
}

export function buildPartLegend(parts = []) {
  const seen = new Map()
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part || part.line) continue
    const id = part.role || part.name || `part-${i}`
    if (seen.has(id)) continue
    seen.set(id, {
      id,
      label: partLabel(part.role, part.name),
      color: part.color || '#94a3b8'
    })
  }
  return [...seen.values()]
}

export function visiblePreviewParts(parts = [], { showSwitch = true } = {}) {
  if (showSwitch) return parts
  return parts.filter((part) => part?.role !== 'switch')
}
