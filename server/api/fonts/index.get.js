import { listInstalledFonts } from '../../utils/fonts.js'

export default defineEventHandler(async () => listInstalledFonts())
