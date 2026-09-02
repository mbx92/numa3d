/** Mode warna global tools: hex manual atau pilih dari material DB. */
export function useToolColorMode() {
  const mode = useState('toolColorMode', () => 'hex')
  return { mode }
}
