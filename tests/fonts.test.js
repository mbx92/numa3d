import test from 'node:test'
import assert from 'node:assert/strict'
import { extractFontUrl, variantToCssSpec, listInstalledFonts, resolveFontPath } from '../server/utils/fonts.js'

test('extractFontUrl prefers TTF over WOFF2', () => {
  const css = `
    @font-face {
      src: url(https://fonts.gstatic.com/s/bebasneue/v1/font.woff2) format('woff2'),
           url(https://fonts.gstatic.com/s/bebasneue/v1/font.ttf) format('truetype');
    }
  `
  assert.equal(extractFontUrl(css), 'https://fonts.gstatic.com/s/bebasneue/v1/font.ttf')
})

test('extractFontUrl prefers WOFF when TTF is missing', () => {
  const css = `
    @font-face {
      src: url("https://fonts.gstatic.com/s/x/font.woff2") format("woff2"),
           url("https://fonts.gstatic.com/s/x/font.woff") format("woff");
    }
  `
  assert.equal(extractFontUrl(css), 'https://fonts.gstatic.com/s/x/font.woff')
})

test('extractFontUrl reads a single quoted url()', () => {
  const css = `@font-face { src: url('https://fonts.gstatic.com/s/x/Regular.ttf') format('truetype'); }`
  assert.equal(extractFontUrl(css), 'https://fonts.gstatic.com/s/x/Regular.ttf')
})

test('extractFontUrl throws when no url is present', () => {
  assert.throws(() => extractFontUrl('@font-face { font-family: X; }'), /URL font tidak ditemukan/)
})

test('variantToCssSpec maps regular and italic keys', () => {
  assert.deepEqual(variantToCssSpec('400'), { italic: 0, weight: 400 })
  assert.deepEqual(variantToCssSpec('700i'), { italic: 1, weight: 700 })
  assert.deepEqual(variantToCssSpec('italic'), { italic: 1, weight: 400 })
})

test('listInstalledFonts includes bundled Roboto and resolveFontPath finds it', () => {
  const fonts = listInstalledFonts()
  assert.ok(fonts.some((f) => f.filename === 'Roboto-Bold.woff'))
  assert.match(resolveFontPath('Roboto-Bold.woff') || '', /Roboto-Bold\.woff$/)
  assert.equal(resolveFontPath('../secret.ttf'), null)
})
