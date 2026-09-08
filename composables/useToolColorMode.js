/** Mode warna global tools: material stok, 1 warna abu-abu, atau hex. */
export function useToolColorMode() {
  const mode = useState('toolColorMode', () => 'material')
  return { mode }
}
