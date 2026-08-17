export function categoryBadgeClass(key) {
  const known = {
    material: 'bg-teal-500/10 text-teal-600',
    packaging: 'bg-sky-500/10 text-sky-700',
    tool: 'bg-ink-200 text-ink-600',
    electricity: 'bg-amber-100 text-amber-700',
    machine: 'bg-slate-200 text-slate-700',
    rnd: 'bg-purple-100 text-purple-700',
    other: 'bg-ink-100 text-ink-500'
  }
  if (known[key]) return known[key]
  const palette = [
    'bg-rose-100 text-rose-700',
    'bg-orange-100 text-orange-700',
    'bg-lime-100 text-lime-800',
    'bg-cyan-100 text-cyan-800',
    'bg-indigo-100 text-indigo-700',
    'bg-fuchsia-100 text-fuchsia-700'
  ]
  let h = 0
  for (const ch of String(key || '')) h = (h + ch.charCodeAt(0)) % palette.length
  return palette[h]
}

export function categoryNameOf(categories, key) {
  return (categories || []).find((c) => c.key === key)?.name || key || '—'
}
