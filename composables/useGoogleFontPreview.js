/** State singleton — semua pemanggil useGoogleFontPreview() berbagi cache font yang sama. */
const loaded = new Set()
const loading = ref(false)
const linkId = 'numa3d-google-fonts-preview'

const localInjected = new Set()

/** Muat & kelola preview Google Fonts via CSS API (batch). */
export function useGoogleFontPreview() {
  function ensureLink() {
    if (!import.meta.client) return null
    let link = document.getElementById(linkId)
    if (!link) {
      link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    return link
  }

  function cssFamily(family) {
    return family ? `'${family}', sans-serif` : 'inherit'
  }

  function variantToAxis(variant = '400') {
    const italic = String(variant).endsWith('i')
    const weight = italic ? variant.slice(0, -1) : variant
    return { italic: italic ? 1 : 0, weight: Number(weight) || 400 }
  }

  function familyCssParam(family, variant = '400') {
    const name = encodeURIComponent(family).replace(/%20/g, '+')
    const { italic, weight } = variantToAxis(variant)
    return `family=${name}:ital,wght@${italic},${weight}`
  }

  function loadFamilies(entries) {
    if (!import.meta.client) return Promise.resolve()
    const list = (entries || [])
      .map((e) => (typeof e === 'string' ? { family: e, variant: '400' } : e))
      .filter((e) => e.family && !loaded.has(`${e.family}::${e.variant || '400'}`))

    if (!list.length) return Promise.resolve()

    const params = list.map((e) => familyCssParam(e.family, e.variant || '400')).join('&')
    const url = `https://fonts.googleapis.com/css2?${params}&display=swap`

    loading.value = true
    return new Promise((resolve) => {
      const onDone = () => {
        list.forEach((e) => loaded.add(`${e.family}::${e.variant || '400'}`))
        loading.value = false
        resolve()
      }
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.onload = onDone
      link.onerror = onDone
      document.head.appendChild(link)
      ensureLink()
      setTimeout(onDone, 2000)
    })
  }

  function loadFamily(family, variant = '400') {
    return loadFamilies([{ family, variant }])
  }

  function styleFor(family) {
    return { fontFamily: cssFamily(family) }
  }

  return { loading, loadFamilies, loadFamily, styleFor, cssFamily }
}

/** Preview font lokal dari public/fonts/ */
export function useLocalFontPreview() {
  function loadFontUrl(url, familyName) {
    if (!import.meta.client || !url) return
    if (localInjected.has(url)) return
    localInjected.add(url)

    const style = document.createElement('style')
    style.dataset.localFont = familyName
    style.textContent = `
      @font-face {
        font-family: '${familyName}';
        src: url('${url}');
        font-display: swap;
      }
    `
    document.head.appendChild(style)
  }

  function styleFor(familyName) {
    return { fontFamily: `'${familyName}', sans-serif` }
  }

  return { loadFontUrl, styleFor }
}
