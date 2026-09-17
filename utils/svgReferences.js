const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** Expand local SVG instances before loading, including SVG2 href references. */
export function expandSvgReferences(document) {
  const sources = new Map([...document.querySelectorAll('[id]')].map((node) => [node.id, node.cloneNode(true)]))
  let count = 0
  function visit(node, ancestors = new Set()) {
    if (['defs', 'symbol'].includes(node.localName)) return
    if (node.localName !== 'use') {
      for (const child of [...node.children]) visit(child, ancestors)
      return
    }
    const href = node.getAttribute('href') || node.getAttributeNS(XLINK_NS, 'href') || ''
    const id = href.slice(1)
    if (!href.startsWith('#') || !sources.has(id)) throw new Error('Referensi SVG tidak ditemukan — gunakan path lokal tanpa tautan eksternal')
    if (ancestors.has(id) || ++count > 1000) throw new Error('Referensi SVG berulang atau terlalu kompleks — ekspor sebagai path biasa')
    const source = sources.get(id).cloneNode(true)
    if (['svg', 'symbol'].includes(source.localName) && source.hasAttribute('viewBox')) {
      throw new Error('Ubah instance symbol SVG menjadi path biasa sebelum diunggah')
    }
    const group = document.createElementNS(SVG_NS, 'g')
    for (const attr of node.attributes) {
      if (!['href', 'xlink:href', 'x', 'y', 'width', 'height'].includes(attr.name)) group.setAttribute(attr.name, attr.value)
    }
    const translated = document.createElementNS(SVG_NS, 'g')
    const x = Number(node.getAttribute('x') || 0)
    const y = Number(node.getAttribute('y') || 0)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Posisi instance SVG harus berupa angka — ubah menjadi path biasa')
    translated.setAttribute('transform', `translate(${x} ${y})`)
    if (source.localName === 'symbol') {
      const content = document.createElementNS(SVG_NS, 'g')
      for (const attr of source.attributes) content.setAttribute(attr.name, attr.value)
      content.append(...source.childNodes)
      translated.append(content)
    } else translated.append(source)
    group.append(translated)
    node.replaceWith(group)
    visit(group, new Set([...ancestors, id]))
  }
  visit(document.documentElement)
  return document.documentElement.outerHTML
}
