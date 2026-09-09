// A small data interpreter, NOT a JavaScript execution sandbox.
// Source can only produce numbers, literal data and allowlisted solid / 2D profile nodes.
export const CODE_LIMITS = Object.freeze({
  source: 16000, tokens: 4000, depth: 48, nodes: 128, cost: 1024, triangles: 200000,
  fieldCells: 500000, fieldAxis: 192, fieldWork: 24000000, fieldSamples: 4000000
})

export function compileCodeStudio(source, values = {}) {
  if (typeof source !== 'string' || source.length > CODE_LIMITS.source) throw new Error('Kode maksimal 16.000 karakter')
  const tokens = []
  const pattern = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|"(?:[^"\\\n]|\\["\\nrt])*"|'(?:[^'\\\n]|\\['\\nrt])*'|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/=,;{}:\[\]]/y
  let offset = 0
  while (offset < source.length) {
    pattern.lastIndex = offset
    const match = pattern.exec(source)
    if (!match) error('Sintaks tidak didukung', offset)
    const text = match[0]
    if (!/^\s|^\/\//.test(text) && !text.startsWith('/*')) tokens.push({ text, offset })
    if (tokens.length > CODE_LIMITS.tokens) error('Kode terlalu kompleks', offset)
    offset += text.length
  }
  tokens.push({ text: '<end>', offset: source.length })
  let index = 0
  let depth = 0
  let nodeCount = 0
  const variables = new Map()
  const solids = new WeakSet()
  const sections = new WeakSet()
  const parameters = []
  const peek = () => tokens[index].text
  function error(message, at = tokens[index]?.offset ?? source.length) {
    const lines = source.slice(0, at).split('\n')
    throw new Error(`Baris ${lines.length}, kolom ${lines.at(-1).length + 1}: ${message}`)
  }
  function take(text) {
    if (peek() !== text) error(`Diharapkan ${text}, ditemukan ${peek()}`)
    index++
  }
  function number(value, min = -10000, max = 10000) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) error(`Angka harus ${min} sampai ${max}`)
    return value
  }
  function vector(value, min = -10000, max = 10000) {
    if (!Array.isArray(value) || value.length !== 3) error('Vektor harus [x, y, z]')
    return value.map((n) => number(n, min, max))
  }
  function vector2(value, min = -10000, max = 10000) {
    if (!Array.isArray(value) || value.length !== 2) error('Vektor 2D harus [x, y]')
    return value.map((n) => number(n, min, max))
  }
  function solid(value) {
    if (value && typeof value === 'object' && sections.has(value)) error('Argumen harus bentuk 3D, bukan profil 2D. Gunakan extrude atau revolve')
    if (!value || typeof value !== 'object' || !solids.has(value)) error('Argumen harus bentuk 3D')
    return value
  }
  function profile(value) {
    if (value && typeof value === 'object' && solids.has(value)) error('Argumen harus profil 2D, bukan bentuk 3D')
    if (!value || typeof value !== 'object' || !sections.has(value)) error('Argumen harus profil 2D')
    return value
  }
  function node(op, args, cost = 1) {
    if (++nodeCount > CODE_LIMITS.nodes || cost > CODE_LIMITS.cost) error('Desain terlalu kompleks; kurangi operasi atau repeat')
    const value = { op, args, cost }
    solids.add(value)
    return value
  }
  function sectionNode(op, args, cost = 1) {
    if (++nodeCount > CODE_LIMITS.nodes || cost > CODE_LIMITS.cost) error('Desain terlalu kompleks; kurangi operasi atau repeat')
    const value = { op, args, cost }
    sections.add(value)
    return value
  }
  function options(value, allowed) {
    if (!value || Array.isArray(value) || typeof value !== 'object' || solids.has(value) || sections.has(value)) error('Opsi harus object literal')
    if (Object.keys(value).some((key) => !allowed.includes(key))) error('Nama opsi tidak didukung')
    return value
  }
  function arity(args, min, max = min) {
    if (args.length < min || args.length > max) error(`Fungsi memerlukan ${min === max ? min : `${min}–${max}`} argumen`)
  }
  function call(name, args) {
    switch (name) {
      case 'param': {
        arity(args, 2, 3)
        const [key, initial] = args
        if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key) || parameters.some((p) => p.name === key)) error('Nama parameter harus unik, diawali huruf, maksimal 32 karakter')
        if (parameters.length >= 16) error('Maksimal 16 parameter')
        const opts = options(args[2] ?? {}, ['min', 'max', 'step'])
        const min = number(opts.min ?? 1)
        const max = number(opts.max ?? 200, min)
        const step = number(opts.step ?? 1, 0.001, 10000)
        number(initial, min, max)
        const value = Object.hasOwn(values, key) ? number(values[key], min, max) : initial
        parameters.push({ name: key, initial, min, max, step, value })
        return value
      }
      case 'box':
        arity(args, 3)
        return node(name, args.map((n) => number(n, 0.01, 1000)))
      case 'roundedBox': {
        arity(args, 4)
        const dimensions = args.slice(0, 3).map((n) => number(n, 0.01, 1000))
        const radius = number(args[3], 0, 500)
        if (radius > Math.min(...dimensions) / 2) error('radius roundedBox maksimal setengah dimensi terkecil')
        return node(name, [...dimensions, radius], 8)
      }
      case 'capsule': {
        arity(args, 1)
        const opts = options(args[0], ['radius', 'height'])
        const radius = number(opts.radius, 0.01, 500)
        const height = number(opts.height, 0.02, 1000)
        if (height < 2 * radius) error('height capsule adalah tinggi total, minimal 2 * radius')
        return node(name, [radius, height], 2)
      }
      case 'cylinder': {
        arity(args, 1)
        const opts = options(args[0], ['radius', 'height', 'segments'])
        const segments = number(opts.segments ?? 48, 8, 96)
        if (!Number.isInteger(segments)) error('segments harus bilangan bulat')
        return node(name, [number(opts.radius, 0.01, 500), number(opts.height, 0.01, 1000), segments])
      }
      case 'sphere':
        arity(args, 1)
        return node(name, [number(args[0], 0.01, 500)])
      case 'torus': {
        arity(args, 1)
        const opts = options(args[0], ['major', 'minor', 'arc', 'segments', 'taper', 'flatten', 'ridges', 'ridgeDepth'])
        const major = number(opts.major, 0.02, 500)
        const minor = number(opts.minor, 0.01, 500)
        if (minor >= major) error('minor torus harus lebih kecil dari major')
        const segments = number(opts.segments ?? 48, 8, 96)
        if (!Number.isInteger(segments)) error('segments harus bilangan bulat')
        const ridges = number(opts.ridges ?? 0, 0, 16)
        if (!Number.isInteger(ridges)) error('ridges harus bilangan bulat')
        return node(name, [
          major, minor, number(opts.arc ?? 360, 1, 360), segments,
          number(opts.taper ?? 0, 0, 1), number(opts.flatten ?? 1, 0.2, 1),
          ridges, number(opts.ridgeDepth ?? 0.18, 0, 0.45)
        ])
      }
      case 'hull': case 'union': case 'subtract': case 'intersect': {
        arity(args, 2, 16)
        args.forEach(solid)
        return node(name, args, args.reduce((sum, v) => sum + v.cost, 1))
      }
      case 'smoothUnion': {
        arity(args, 3)
        solid(args[0]); solid(args[1])
        const radius = number(args[2], 0.1, 100)
        const seen = new Set()
        function fieldInput(value) {
          if (seen.has(value)) return
          seen.add(value)
          if (!['box', 'roundedBox', 'sphere', 'cylinder', 'capsule', 'translate', 'rotate', 'scale', 'smoothUnion', 'union', 'repeat'].includes(value.op)) {
            error(`smoothUnion belum mendukung ${value.op}; lakukan hull/potong/torus/extrude/revolve di luar smoothUnion`)
          }
          if (value.op === 'scale' && !value.args[1].every((v) => v === value.args[1][0])) error('scale di dalam smoothUnion harus seragam [s,s,s]')
          value.args.filter((v) => solids.has(v)).forEach(fieldInput)
        }
        fieldInput(args[0]); fieldInput(args[1])
        return node(name, [args[0], args[1], radius], args[0].cost + args[1].cost + 16)
      }
      case 'translate': case 'rotate': case 'scale': {
        arity(args, 2)
        solid(args[0])
        const v = name === 'scale' ? vector(args[1], 0.01, 100) : vector(args[1])
        return node(name, [args[0], v], args[0].cost + 1)
      }
      case 'repeat': {
        arity(args, 3)
        solid(args[0])
        const count = number(args[1], 1, 32)
        if (!Number.isInteger(count)) error('Jumlah repeat harus bilangan bulat')
        return node(name, [args[0], count, vector(args[2])], (args[0].cost + 1) * count)
      }
      case 'circle2d': {
        arity(args, 1)
        const opts = options(args[0], ['radius', 'segments'])
        const segments = number(opts.segments ?? 48, 8, 96)
        if (!Number.isInteger(segments)) error('segments harus bilangan bulat')
        return sectionNode(name, [number(opts.radius, 0.01, 500), segments])
      }
      case 'rect2d':
        arity(args, 2)
        return sectionNode(name, args.map((n) => number(n, 0.01, 1000)))
      case 'polygon': {
        arity(args, 1)
        const opts = options(args[0], ['sides', 'radius', 'inner'])
        const sides = number(opts.sides, 3, 24)
        if (!Number.isInteger(sides)) error('sides harus bilangan bulat')
        return sectionNode(name, [sides, number(opts.radius, 0.01, 500), number(opts.inner ?? 1, 0.05, 1)])
      }
      case 'offset':
        arity(args, 2)
        profile(args[0])
        return sectionNode(name, [args[0], number(args[1], -500, 500)], args[0].cost + 1)
      case 'translate2d':
        arity(args, 2)
        profile(args[0])
        return sectionNode(name, [args[0], vector2(args[1])], args[0].cost + 1)
      case 'rotate2d':
        arity(args, 2)
        profile(args[0])
        return sectionNode(name, [args[0], number(args[1])], args[0].cost + 1)
      case 'scale2d': {
        arity(args, 2)
        profile(args[0])
        const factor = typeof args[1] === 'number' ? number(args[1], 0.01, 100) : null
        const v = factor == null ? vector2(args[1], 0.01, 100) : [factor, factor]
        return sectionNode(name, [args[0], v], args[0].cost + 1)
      }
      case 'union2d': case 'subtract2d': case 'intersect2d': {
        arity(args, 2, 16)
        args.forEach(profile)
        return sectionNode(name, args, args.reduce((sum, v) => sum + v.cost, 1))
      }
      case 'extrude': {
        arity(args, 2)
        profile(args[0])
        if (typeof args[1] === 'number') {
          return node(name, [args[0], number(args[1], 0.01, 1000), 0, 0], args[0].cost + 2)
        }
        const opts = options(args[1], ['height', 'twist', 'divisions'])
        const height = number(opts.height, 0.01, 1000)
        const twist = number(opts.twist ?? 0, -360, 360)
        const divisions = number(opts.divisions ?? 0, 0, 64)
        if (!Number.isInteger(divisions)) error('divisions harus bilangan bulat')
        if (Math.abs(twist) > 0 && divisions < 4) error('twist extrude memerlukan divisions minimal 4')
        return node(name, [args[0], height, divisions, twist], args[0].cost + 2)
      }
      case 'revolve': {
        arity(args, 1, 2)
        profile(args[0])
        const opts = options(args[1] ?? {}, ['arc', 'segments'])
        const segments = number(opts.segments ?? 48, 8, 96)
        if (!Number.isInteger(segments)) error('segments harus bilangan bulat')
        return node(name, [args[0], segments, number(opts.arc ?? 360, 1, 360)], args[0].cost + 4)
      }
      default: error(`Fungsi ${name} tidak tersedia`)
    }
  }
  function atom() {
    if (++depth > CODE_LIMITS.depth) error('Ekspresi terlalu dalam')
    try {
      const token = peek()
      if (token === '+' || token === '-') {
        index++
        return number(number(atom()) * (token === '-' ? -1 : 1))
      }
      if (token === '(') { index++; const value = expression(); take(')'); return value }
      if (/^[\d.]/.test(token)) { index++; return number(Number(token)) }
      if (token.startsWith('"') || token.startsWith("'")) {
        index++
        return token.slice(1, -1).replace(/\\(["'\\nrt])/g, (_, ch) => ({ n: '\n', r: '\r', t: '\t' }[ch] ?? ch))
      }
      if (token === '[') {
        index++
        const result = []
        if (peek() !== ']') do {
          if (result.length >= 16) error('Array maksimal 16 nilai')
          result.push(expression())
          if (peek() !== ',') break
          index++
        } while (peek() !== ']')
        take(']')
        return result
      }
      if (token === '{') {
        index++
        const result = Object.create(null)
        if (peek() !== '}') do {
          const key = peek()
          if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key) || Object.hasOwn(result, key)) error('Nama opsi tidak valid atau duplikat')
          index++; take(':'); result[key] = expression()
          if (peek() !== ',') break
          index++
        } while (peek() !== '}')
        take('}')
        return result
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
        index++
        if (peek() === '(') {
          index++
          const args = []
          if (peek() !== ')') do {
            if (args.length >= 16) error('Terlalu banyak argumen')
            args.push(expression())
            if (peek() !== ',') break
            index++
          } while (peek() !== ')')
          take(')')
          return call(token, args)
        }
        if (!variables.has(token)) error(`Variabel ${token} tidak dikenal`)
        return variables.get(token)
      }
      error(`Ekspresi tidak didukung: ${token}`)
    } finally { depth-- }
  }
  function expression(min = 0) {
    let value = atom()
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 }
    while ((precedence[peek()] || 0) > min) {
      const op = peek(); index++
      const right = expression(precedence[op])
      const a = number(value), b = number(right)
      value = number(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b)
    }
    return value
  }
  while (peek() === 'const') {
    index++
    const name = peek()
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || ['constructor', 'prototype', '__proto__', 'return', 'const'].includes(name) || variables.has(name)) error('Nama variabel tidak valid atau duplikat')
    index++; take('='); variables.set(name, expression())
    if (peek() === ';') index++
  }
  take('return')
  const root = solid(expression())
  if (peek() === ';') index++
  take('<end>')
  return { root, parameters, nodeCount }
}
