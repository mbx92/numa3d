import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'

test('custom order waits for STL / 3MF slicing, maps missing 3MF colors, checks stock, and previews HPP, and invalidates a replaced file', async () => {
  const window = new Window()
  for (const name of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node']) globalThis[name] = name === 'window' ? window : window[name]
  const require = createRequire(import.meta.url)
  const peerRequire = createRequire(require.resolve('@heroicons/vue/24/outline'))
  const vueUrl = pathToFileURL(peerRequire.resolve('vue/dist/vue.runtime.esm-bundler.js')).href
  const pageUrl = new URL('../pages/custom-orders/index.vue', import.meta.url)
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'vue') return next(vueUrl, context)
    if (specifier.startsWith('~/')) return next(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context)
    if (context.parentURL?.startsWith('data:')) return next(specifier, { ...context, parentURL: pageUrl.href })
    return next(specifier, context)
  } })
  const { createApp, h, Suspense, ref, computed, nextTick } = await import(vueUrl)
  const { parse, compileScript } = peerRequire('vue/compiler-sfc')
  const compile = async (url, id) => {
    const { descriptor } = parse(readFileSync(fileURLToPath(url), 'utf8'))
    const compiled = compileScript(descriptor, { id, inlineTemplate: true })
    const source = `import { computed, ref, shallowRef, watch, onUnmounted } from 'vue';\n${compiled.content}`
    return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default
  }
  const Page = await compile(pageUrl, 'custom-order-page-test')
  const Slicer = await compile(new URL('../components/CustomOrderSlice.vue', import.meta.url), 'custom-order-slicer-test')
  const materials = [
    { id: 8, name: 'PLA White', type: 'filament', unit: 'gram', pricePerUnit: 200, filamentTypeName: 'PLA', stockQuantity: 100, color: '#ffffff' },
    { id: 9, name: 'PLA Black', type: 'filament', unit: 'gram', pricePerUnit: 250, filamentTypeName: 'PLA', stockQuantity: 100, color: '#000000' },
    { id: 10, name: 'Resin', type: 'resin', unit: 'ml', pricePerUnit: 100 },
    { id: 11, name: 'PETG', type: 'filament', unit: 'gram', pricePerUnit: 250, filamentTypeName: 'PETG' }
  ]
  globalThis.useFetch = async (url) => ({ data: ref({
    '/api/custom-orders': [], '/api/materials': materials, '/api/machines': [],
    '/api/packaging': [], '/api/settings': { defaultMarginPercent: 40, priceRoundStep: 500 }
  }[url]), refresh() {} })
  globalThis.usePagination = (rows) => ({ page: ref(1), pageSize: ref(10), paged: rows, total: computed(() => rows.value.length), totalPages: ref(1), rangeStart: ref(0), rangeEnd: ref(0), reset() {} })
  globalThis.todayStr = () => '2026-09-18'
  let saved, navigated, calls = 0, multi = false
  globalThis.navigateTo = async (to) => { navigated = to }
  globalThis.$fetch = async (url, options) => {
    if (url === '/api/slicer/inspect') {
      multi = options.body.get('file').name.endsWith('.3mf')
      return multi ? { format: '3mf', colors: ['#ffffff', '#ff0000'], hasDefinedColors: true, maxColors: 4 } : { format: 'stl', colors: ['#ffffff'], hasDefinedColors: false, maxColors: 1 }
    }
    if (url === '/api/slicer/jobs') {
      assert.equal(options.body.get('tool'), 'custom-order')
      assert.ok(['box.stl', 'box.3mf'].includes(options.body.get('file').name))
      return { id: 9, status: 'queued', stage: 'Menunggu worker' }
    }
    if (url === '/api/slicer/jobs/9') return {
      id: 9, status: 'completed', stage: 'Selesai',
      result: multi ? { totalGrams: 10, printTimeSeconds: 577, filamentGrams: [4, 6], colors: ['#ffffff', '#000000'], materialIds: [8, 9] } : { totalGrams: 2.02, printTimeSeconds: 577, filamentGrams: [2.02], colors: ['#FFFFFF'], materialIds: [8] }
    }
    assert.equal(url, '/api/custom-orders')
    calls++
    saved = options.body
    return { id: 71 }
  }
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Page) }) })
  app.component('CustomOrderSlice', Slicer)
  app.component('AppModal', { render() { return h('div', { class: 'test-modal' }, this.$slots.default?.()) } })
  app.component('IdrInput', { props: ['modelValue'], emits: ['update:modelValue'], render() {
    return h('input', { value: this.modelValue, onInput: (event) => this.$emit('update:modelValue', Number(event.target.value)) })
  } })
  for (const name of ['NuxtLink', 'AppPagination']) app.component(name, { render() { return h('div', this.$slots.default?.()) } })
  app.config.globalProperties.formatIDR = (n) => `Rp${n}`
  app.config.globalProperties.formatDate = String
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 10)); await nextTick() }
  const button = (text) => [...host.querySelectorAll('button')].find((item) => item.textContent.includes(text))
  const pick = async (name) => {
    const input = host.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['STL fixture'], name)] })
    input.dispatchEvent(new window.Event('change'))
    await settle()
  }
  try {
    app.mount(host)
    await settle()
    button('Pesanan Custom').click()
    await settle()
    assert.equal(button('Simpan pesanan').disabled, true)
    assert.equal(host.textContent.includes('HPP estimasi'), false)
    assert.equal(host.querySelector('input[type="file"]').multiple, false)
    assert.equal(host.querySelector('input[type="file"]').accept, '.stl,.3mf')
    await pick('box.stl')
    const materialSelect = [...host.querySelectorAll('select')].find((item) => item.textContent.includes('PLA White'))
    assert.equal(materialSelect.multiple, false)
    assert.equal(materialSelect.textContent.includes('PETG'), false)
    assert.equal(materialSelect.textContent.includes('Resin'), false)
    button('Slice dengan Orca').click()
    await settle()
    assert.equal(button('Simpan pesanan').disabled, false)
    assert.match(host.textContent, /2\.02 g.*9 menit 37 detik/)
    assert.match(host.textContent, /HPP estimasi Rp424/)
    assert.deepEqual([...host.querySelectorAll('input[readonly]')].map((item) => item.value), ['2.02', '10'])
    await pick('replacement.stl')
    assert.equal(button('Simpan pesanan').disabled, true)
    assert.equal(host.textContent.includes('HPP estimasi'), false)
    await pick('unsupported.obj')
    assert.match(host.textContent, /Pilih file STL atau 3MF/)
    assert.equal(button('Slice dengan Orca').disabled, true)
    await pick('box.3mf')
    assert.equal(button('Slice dengan Orca').disabled, true)
    const mapping = [...host.querySelectorAll('select')].filter((item) => item.textContent.includes('Pilih material / pengganti'))
    assert.equal(mapping.length, 2)
    mapping[1].value = '9'
    mapping[1].dispatchEvent(new window.Event('change'))
    await settle()
    assert.equal(button('Slice dengan Orca').disabled, false)
    button('Slice dengan Orca').click()
    await settle()
    const quantity = [...host.querySelectorAll('input[type="number"]')].find((item) => item.min === '1')
    quantity.value = '20'
    quantity.dispatchEvent(new window.Event('input'))
    await settle()
    assert.equal(button('Simpan pesanan').disabled, true)
    assert.match(host.textContent, /Stok PLA Black kurang/)
    quantity.value = '3'
    quantity.dispatchEvent(new window.Event('input'))
    await settle()
    assert.match(host.textContent, /total Rp7245/)
    host.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }))
    await settle()
    assert.equal(calls, 1)
    assert.equal(saved.slicerJobId, 9)
    assert.equal(saved.materialId, 8)
    assert.equal(saved.materialQuantityUsed, 10)
    assert.equal(saved.printTimeMinutes, 10)
    assert.equal(saved.quantity, 3)
    assert.deepEqual(saved.materialUsage, [{ materialId: 8, quantityUsed: 4 }, { materialId: 9, quantityUsed: 6 }])
    assert.equal(navigated, '/custom-orders/71')
  } finally {
    app.unmount()
    hooks.deregister()
    await window.happyDOM.close()
  }
})
