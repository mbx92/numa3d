const invalid = () => Object.assign(new Error('Data pewarnaan segitiga 3MF tidak valid'), { statusCode: 400 })

// Orca 2.4.2 TriangleSelector.cpp / Model.cpp: reverse hex nibbles, subdivision
// headers, then leaf extruder states. Keep the subdivision tree when remapping.
export function mapFilamentPainting(text, map = null) {
  if (!/^[\da-f]{1,65536}$/i.test(text)) throw invalid()
  const input = [...text.toUpperCase()].reverse().map((value) => parseInt(value, 16))
  const output = [], states = new Set()
  let cursor = 0
  const read = () => { if (cursor >= input.length) throw invalid(); return input[cursor++] }
  const visit = (depth = 0) => {
    if (depth > 64) throw invalid()
    const code = read(), split = code & 3
    if (split) {
      if (split < 3 && code >> 2 > 2) throw invalid()
      output.push(code)
      for (let i = 0; i <= split; i++) visit(depth + 1)
    } else {
      const state = (code & 12) === 12 ? read() + 3 : code >> 2
      if (state > 16) throw invalid()
      states.add(state)
      const value = state && map ? map[state - 1] + 1 : state
      if (!Number.isInteger(value) || value < 0 || value > 16) throw invalid()
      if (value < 3) output.push(value << 2)
      else output.push(12, value - 3)
    }
  }
  visit()
  if (cursor !== input.length) throw invalid()
  return { text: output.reverse().map((value) => value.toString(16).toUpperCase()).join(''), states: [...states] }
}

export function filamentPaintingForSlot(slot) {
  const state = slot + 1
  if (!Number.isInteger(slot) || slot < 0 || slot > 15) throw invalid()
  return state < 3 ? (state << 2).toString(16).toUpperCase() : `${(state - 3).toString(16).toUpperCase()}C`
}
