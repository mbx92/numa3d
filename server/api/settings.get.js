import { getSettings } from '../utils/settings.js'

export default defineEventHandler(async () => {
  return getSettings()
})
