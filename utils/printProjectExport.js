import { printGroupsTo3mfBuffer } from './keychainExport.js'

// Cache by profile so toggling the export settings never returns an older profile.
export function createPrintProjectExport(groups, modelName, defaultPreset = null) {
  const cache = new Map()
  return function ({ processPreset = defaultPreset } = {}) {
    if (!cache.has(processPreset)) {
      cache.set(processPreset, new Blob([
        printGroupsTo3mfBuffer(groups, modelName, undefined, { processPreset })
      ], { type: 'model/3mf' }))
    }
    return cache.get(processPreset)
  }
}
