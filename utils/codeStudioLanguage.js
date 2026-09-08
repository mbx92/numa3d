// A small data interpreter, NOT a JavaScript execution sandbox.
// Source can only produce numbers, literal data and allowlisted solid nodes.
export const CODE_LIMITS = Object.freeze({ source: 16000, tokens: 4000, depth: 48, nodes: 128, cost: 1024, triangles: 200000 })

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
  function solid(value) {
    if (!value || typeof value !== 'object' || !solids.has(value)) error('Argumen harus bentuk 3D')
    return value
  }
  function node(op, args, cost = 1) {
    if (++nodeCount > CODE_LIMITS.nodes || cost > CODE_LIMITS.cost) error('Desain terlalu kompleks; kurangi operasi atau repeat')
    const value = { op, args, cost }
    solids.add(value)
    return value
  }
  function options(value, allowed) {
    if (!value || Array.isArray(value) || typeof value !== 'object' || solids.has(value)) error('Opsi harus object literal')
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
      case 'union': case 'subtract': case 'intersect': {
        arity(args, 2, 16)
        args.forEach(solid)
        return node(name, args, args.reduce((sum, v) => sum + v.cost, 1))
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
