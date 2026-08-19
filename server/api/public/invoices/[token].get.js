import { loadPublicInvoice } from '../../../utils/publicInvoice.js'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const { invoice, expiresAt } = await loadPublicInvoice(token)
  return { ...invoice, expiresAt }
})
