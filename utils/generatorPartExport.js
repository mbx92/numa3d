import { EXPORT_FORMATS, exportFilename } from './keychainExport.js'

const PARTS = {
  base: { names: ['Base'], filenames: ['baseFilename'] },
  text: { names: ['Text'], filenames: ['textFilename'] },
  lid: { names: ['Lid', 'Accent'], filenames: ['lidFilename', 'accentFilename'] },
  face: { names: ['FrontSide', 'Face'], filenames: ['frontSideFilename', 'baseFilename'] },
  body: { names: ['Back', 'Body'], filenames: ['backFilename', 'bodyFilename'] },
  stand: { names: ['Stand'], filenames: ['standFilename'] },
  assembly: { names: ['Assembly'], filenames: [] }
}
const SUFFIXES = {
  '3mf': '3mfBlob',
  glb: 'GlbBlob',
  'stl-parts': 'MultiStlBlob',
  'stl-color': 'ColoredStlBlob',
  stl: 'Blob'
}

// Downloads and gallery uploads use the same model snapshot and format mapping.
export async function resolveGeneratorPartExport(model, part, format) {
  if (!model) throw new Error('Generate model dulu untuk export')
  const config = PARTS[part]
  if (!config || !EXPORT_FORMATS.some((entry) => entry.id === format)) {
    throw new Error('Part atau format export tidak didukung')
  }
  if (part === 'assembly' && !['3mf', 'glb'].includes(format)) {
    throw new Error('Assembly hanya tersedia untuk 3MF dan GLB')
  }
  const method = config.names.map((name) => `get${name}${SUFFIXES[format]}`)
    .find((name) => typeof model[name] === 'function')
  const blob = method ? await model[method]() : null
  const suffix = part === 'stand' ? `stand_${model.dimensions?.standModelId || 'model'}` : part
  const originalFilename = config.filenames.map((key) => model[key]).find(Boolean)
  const filename = format === 'stl' && originalFilename
    ? originalFilename : exportFilename(model.slug, suffix, format)
  return { blob, filename }
}
