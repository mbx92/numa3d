const MODEL_EXT = new Set(['stl', 'obj', '3mf', 'glb', 'gltf'])
const UUID_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_COMPACT = /^[0-9a-f]{32}$/i

export function fileExt(name) {
  const parts = String(name || '').split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

export function fileStem(name) {
  const raw = String(name || '')
  const ext = fileExt(raw)
  if (!ext) return raw
  return raw.slice(0, -(ext.length + 1))
}

export function isUuidFilename(name) {
  const stem = fileStem(name) || String(name || '')
  return UUID_NAME.test(stem) || UUID_COMPACT.test(stem)
}

export function cleanModelStem(input) {
  let name = String(input || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const last = fileExt(name)
  if (last && MODEL_EXT.has(last)) name = fileStem(name).trim()
  return name.slice(0, 160)
}

