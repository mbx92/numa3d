const betaToolPaths = [
  '/tools/code-studio',
  '/tools/mesh-clicker',
  '/tools/lightbox',
  '/tools/font-downloader',
  '/tools/png-to-svg'
]

export function isBetaToolPath(path) {
  const normalized = path.replace(/\/+$/, '')
  return normalized === '/tools/beta' || betaToolPaths.includes(normalized)
}
