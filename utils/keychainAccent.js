/** Indeks karakter teks yang memakai warna aksen. */
export function pruneAccentIndices(text, indices) {
  const len = String(text || '').length
  return [...new Set((indices || []).filter((i) => Number.isInteger(i) && i >= 0 && i < len))].sort(
    (a, b) => a - b
  )
}

export function toggleAccentIndex(indices, index, text) {
  if (index < 0 || index >= String(text || '').length) return pruneAccentIndices(text, indices)
  const set = new Set(indices || [])
  if (set.has(index)) set.delete(index)
  else set.add(index)
  return pruneAccentIndices(text, [...set])
}

export function isAccentIndex(indices, index) {
  return (indices || []).includes(index)
}

export function accentIndicesToLabel(text, indices) {
  return pruneAccentIndices(text, indices)
    .map((i) => text[i])
    .join(' · ')
}
