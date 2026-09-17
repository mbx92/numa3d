import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveGeneratorPartExport } from '../utils/generatorPartExport.js'

test('gallery and download resolve the selected format for every printable part', async () => {
  for (const [part, prefix] of Object.entries({ base: 'Base', text: 'Text', lid: 'Lid', face: 'FrontSide', body: 'Back', stand: 'Stand' })) {
    for (const [format, suffix, extension] of [
      ['3mf', '3mfBlob', '3mf'], ['glb', 'GlbBlob', 'glb'], ['stl-parts', 'MultiStlBlob', 'stl'],
      ['stl-color', 'ColoredStlBlob', 'stl'], ['stl', 'Blob', 'stl']
    ]) {
      const expected = new Blob([`${part}-${format}`])
      const model = { slug: 'sample', [`get${prefix}${suffix}`]: async function () {
        assert.equal(this.slug, 'sample')
        return expected
      } }
      const { blob, filename } = await resolveGeneratorPartExport(model, part, format)
      assert.equal(blob, expected)
      assert.ok(filename.endsWith(`.${extension}`), filename)
      if (part === 'lid') assert.match(filename, /_lid/)
    }
  }
})

test('legacy method aliases and original mono STL names remain supported', async () => {
  const model = { slug: 'test', accentFilename: 'original_lid.stl', getAccentBlob: () => new Blob(['lid']) }
  const output = await resolveGeneratorPartExport(model, 'lid', 'stl')
  assert.equal(output.filename, 'original_lid.stl')
  assert.equal(await output.blob.text(), 'lid')
})

test('absent optional parts return null and unsupported exports fail explicitly', async () => {
  const model = { slug: 'test', getStand3mfBlob: () => null }
  assert.equal((await resolveGeneratorPartExport(model, 'stand', '3mf')).blob, null)
  await assert.rejects(resolveGeneratorPartExport(model, 'assembly', 'stl'), /Assembly/)
  await assert.rejects(resolveGeneratorPartExport(model, 'base', 'invalid'), /tidak didukung/)
  await assert.rejects(resolveGeneratorPartExport(null, 'base', '3mf'), /Generate model/)
})
