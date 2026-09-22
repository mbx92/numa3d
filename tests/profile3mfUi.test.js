import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'

test('3MF profile page inspects a selected file and downloads the converted project', async () => {
  const window = new Window()
  for (const name of ['window', 'document', 'Element', 'HTMLElement', 'HTMLAnchorElement', 'SVGElement', 'Node', 'FormData', 'File', 'Blob', 'URL']) {
    globalThis[name] = name === 'window' ? window : window[name]
  }
  globalThis.definePageMeta = () => {}
  const toasts = []
  globalThis.useToast = () => ({ success: (message) => toasts.push(message), error: (message) => toasts.push(message) })

  const require = createRequire(import.meta.url)
  const peerRequire = createRequire(require.resolve('@heroicons/vue/24/outline'))
  const vueUrl = pathToFileURL(peerRequire.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
  const pageUrl = new URL('../pages/tools/3mf-profile.vue', import.meta.url)
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'vue') return next(vueUrl, context)
    if (specifier.startsWith('~/')) return next(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context)
    if (context.parentURL?.startsWith('data:')) return next(specifier, { ...context, parentURL: pageUrl.href })
    return next(specifier, context)
  } })
  const { createApp, h, ref, computed, nextTick } = await import(vueUrl)
  globalThis.ref = ref
  globalThis.computed = computed
  const inventory = [{ id: 7, name: 'Elegoo PLA - Hitam', type: 'filament', unit: 'gram', filamentTypeName: 'PLA', stockQuantity: 500, color: '#000000' }]
  globalThis.useFetch = (url) => ({ data: ref(url === '/api/materials' ? inventory : { ready: true, message: 'Worker OrcaSlicer aktif' }) })
  const { parse, compileScript } = peerRequire('vue/compiler-sfc')
  const { descriptor } = parse(readFileSync(fileURLToPath(pageUrl), 'utf8'))
  const compiled = compileScript(descriptor, { id: 'profile-3mf-page-test', inlineTemplate: true })
  const Page = (await import(`data:text/javascript;base64,${Buffer.from(`import { ref, computed, onUnmounted } from 'vue';\n${compiled.content}`).toString('base64')}`)).default

  const calls = []
  globalThis.$fetch = async (url, options) => {
    calls.push({ url, file: options.body.get('file'), materialIds: options.body.get('materialIds') })
    if (url.endsWith('/inspect')) return {
      sourceFilename: 'sample.3mf', outputFilename: 'sample_Anycubic-Kobra-X_QR-Detail.3mf', sizeBytes: 1234,
      compatible: true, issues: [],
      model: { size: [20, 18, 10], colors: ['#d3c5a3'], maxColors: 4, objects: 1, triangles: 12 },
      profile: { label: 'QR Plate Detail' }
    }
    if (url === '/api/slicer/jobs') return {
      id: 41, status: 'completed', stage: 'Selesai',
      result: { totalGrams: 12.34, printTimeSeconds: 3723, filamentGrams: [12.34], colors: ['#000000'], materialIds: [7], profile: 'QR Plate Detail', bed: 'Textured PEI Plate', primeTower: false, filamentChanges: 0 }
    }
    return new Blob(['converted'], { type: 'model/3mf' })
  }
  let downloaded = ''
  window.URL.createObjectURL = () => 'blob:test'
  window.URL.revokeObjectURL = () => {}
  window.HTMLAnchorElement.prototype.click = function () { downloaded = this.download }

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(Page)
  app.component('InfoTooltip', { render() { return h('span', this.$slots.default?.()) } })
  app.component('NuxtLink', { render() { return h('a', this.$slots.default?.()) } })
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 10)); await nextTick() }
  try {
    app.mount(host)
    const input = host.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['3mf'], 'sample.3mf', { type: 'model/3mf' })] })
    input.dispatchEvent(new window.Event('change'))
    await settle()
    assert.equal(calls[0].url, '/api/tools/3mf-profile/inspect')
    assert.match(host.textContent, /Siap dikonversi/)
    assert.match(host.textContent, /20 × 18 × 10 mm/)
    const select = host.querySelector('select')
    assert.equal(select.value, '')
    select.value = '7'
    select.dispatchEvent(new window.Event('change'))
    await nextTick()
    assert.equal(host.querySelector('[data-testid="material-color-0"]').style.backgroundColor, '#000000')
    assert.match(host.textContent, /Model #D3C5A3 → filament #000000/)
    const sliceButton = [...host.querySelectorAll('button')].find((entry) => entry.textContent.includes('Slice gram & waktu'))
    assert.equal(sliceButton.disabled, false)
    sliceButton.click()
    await settle()
    assert.ok(calls.some((entry) => entry.url === '/api/slicer/jobs' && entry.file.name === 'sample.3mf'))
    assert.match(host.textContent, /12\.34 g/)
    assert.match(host.textContent, /1 jam 2 menit 3 detik/)
    assert.match(host.textContent, /Elegoo PLA - Hitam/)
    const button = [...host.querySelectorAll('button')].find((entry) => entry.textContent.includes('Konversi & download'))
    assert.equal(button.disabled, false)
    button.click()
    await settle()
    assert.ok(calls.some((entry) => entry.url === '/api/tools/3mf-profile/convert' && entry.materialIds === '[7]'))
    assert.equal(downloaded, 'sample_Anycubic-Kobra-X_QR-Detail.3mf')
    assert.ok(toasts.includes('3MF profil Anycubic berhasil diunduh'))
  } finally {
    app.unmount()
    hooks.deregister()
    await window.happyDOM.close()
  }
})
