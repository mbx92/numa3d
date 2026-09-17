/** Warna tools hanya dari material stok. HEX preview mengikuti swatch material. */
export function useToolColorMode() {
  const mode = useState('toolColorMode', () => 'material')
  if (mode.value !== 'material') mode.value = 'material'
  return { mode }
}
