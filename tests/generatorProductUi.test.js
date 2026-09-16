import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'

test('generator saves the sliced model as a new product and prevents duplicate clicks', async () => {
  const window = new Window()
  for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node']) globalThis[name] = name === 'window' ? window : window[name]
  const require = createRequire(import.meta.url)
  const peerRequire = createRequire(require.resolve('@heroicons/vue/24/outline'))
  const vueUrl = pathToFileURL(peerRequire.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
  const componentUrl = new URL('../components/GeneratorSliceHpp.vue', import.meta.url)
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'vue') return next(vueUrl, context)
    if (specifier.startsWith('~/')) return next(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context)
    if (context.parentURL?.startsWith('data:')) return next(specifier, { ...context, parentURL: componentUrl.href })
    return next(specifier, context)
  } })
  const { createApp, h, Suspense, ref, shallowRef, nextTick } = await import(vueUrl)
  const { parse, compileScript } = peerRequire('vue/compiler-sfc')
  const { descriptor } = parse(readFileSync(fileURLToPath(componentUrl), 'utf8'))
  const compiled = compileScript(descriptor, { id: 'generator-save-test', inlineTemplate: true })
  const source = `import { computed, ref, shallowRef, watch } from 'vue';\n${compiled.content}`
  const Component = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default
  const materials = [{ id: 8, name: 'PLA White', type: 'filament', unit: 'gram', pricePerUnit: 200 }]
  globalThis.useState = () => ref({ role: 'admin' })
  const failures = []
  globalThis.useToast = () => ({ success() {}, error(message) { failures.push(message) } })
  globalThis.useFetch = async (url) => ({ data: ref({ '/api/materials': materials, '/api/machines': [], '/api/settings': {}, '/api/slicer/status': { ready: true, message: 'Ready' } }[url]) })
  let sliceFile
  let saveBody
  let saveCalls = 0
  let releaseSave
  globalThis.$fetch = async (url, options) => {
    if (url === '/api/slicer/slice') {
      sliceFile = await options.body.get('file').text()
      return { totalGrams: 4.65, printTimeSeconds: 1594, filamentGrams: [4.65], colors: ['#ffffff'], profile: 'Kobra X', slicerVersion: 'test' }
    }
    assert.equal(url, '/api/products/from-generator')
    saveCalls++
    saveBody = options.body
    await new Promise((resolve) => { releaseSave = resolve })
    return { id: 71, name: 'Keychain AB', status: 'draft' }
  }
  let exports = 0
  const model = shallowRef({ slug: 'ab', async get3mfBlob() { exports++; return new Blob(['sliced snapshot']) } })
  const ids = ref({ base: 8 })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Component, {
    result: model.value, tool: 'keychain', modelName: 'Keychain AB',
    colorFields: [{ key: 'base' }], materialIds: ids.value, colors: { base: '#ffffff' }
  }) }) })
  app.component('NuxtLink', { props: ['to'], render() { return h('a', { href: this.to }, this.$slots.default?.()) } })
  app.config.globalProperties.formatNumber = String
  app.config.globalProperties.formatIDR = String
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 10)); await nextTick() }
  const button = (text) => [...host.querySelectorAll('button')].find((item) => item.textContent.includes(text))
  try {
    app.mount(host)
    await settle()
    button('Slice gram').click()
    await settle()
    assert.equal(host.querySelector('input').value, 'Keychain AB')
    assert.equal(host.querySelectorAll('select').length, 1) // Only machine, no existing product selector.
    ids.value = {}
    await settle()
    assert.equal(button('Simpan sebagai').disabled, true)
    ids.value = { base: 8 }
    await settle()
    button('Simpan sebagai').click()
    await settle()
    assert.equal(button('Menyimpan').disabled, true)
    button('Menyimpan').click()
    assert.equal(saveCalls, 1)
    const payload = JSON.parse(saveBody.get('product'))
    assert.equal(payload.name, 'Keychain AB')
    assert.equal(payload.printTimeSeconds, 1594)
    assert.deepEqual(payload.materials, [{ materialId: 8, quantityUsed: 4.7 }])
    assert.equal('productId' in payload, false)
    assert.equal(await saveBody.get('file').text(), sliceFile)
    assert.equal(exports, 1)
    releaseSave()
    await settle()
    assert.equal(button('Produk sudah tersimpan').disabled, true)
    assert.equal(host.querySelector('a').getAttribute('href'), '/products/71')
    model.value = { slug: 'new', get3mfBlob: async () => new Blob(['new']) }
    await settle()
    assert.equal(host.querySelector('a'), null)
    assert.equal(button('Simpan sebagai'), undefined)
    assert.deepEqual(failures, [])
  } finally {
    app.unmount()
    hooks.deregister()
    await window.happyDOM.close()
  }
})
