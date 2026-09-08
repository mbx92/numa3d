import { sanitizeText } from './sanitizeText.js'

const METHODS = ['cash', 'transfer', 'marketplace', 'other']
const MARKETPLACE = new Set(['tokopedia', 'shopee', 'tiktok_shop'])

export function defaultPaymentStatus(_channel) {
  return 'unpaid'
}

export function defaultPaymentMethod(channel, status) {
  if (status !== 'paid') return null
  return MARKETPLACE.has(channel) ? 'marketplace' : 'cash'
}

export function afterFeeOf(row) {
  const qty = Math.max(Math.round(Number(row?.quantity) || 0), 0)
  const price = Math.max(Math.round(Number(row?.salePricePerUnit) || 0), 0)
  const feePct = Math.min(Math.max(Number(row?.marketplaceFeePercent) || 0, 0), 100)
  const gross = price * qty
  const fee = Math.round(gross * (feePct / 100))
  return Math.max(gross - fee, 0)
}

export function resolveDiscount(body, afterFee) {
  const cap = Math.max(Math.round(Number(afterFee) || 0), 0)
  const kind = body.discountKind === 'percent' ? 'percent' : 'amount'
  if (kind === 'percent') {
    const percent = Math.min(Math.max(Number(body.discountPercent) || 0, 0), 100)
    return {
      discountKind: 'percent',
      discountPercent: percent,
      discountAmount: Math.round(cap * (percent / 100))
    }
  }
  const amount = Math.min(Math.max(Math.round(Number(body.discountAmount) || 0), 0), cap)
  return {
    discountKind: 'amount',
    discountPercent: cap ? Math.round((amount / cap) * 1000) / 10 : 0,
    discountAmount: amount
  }
}

export function parseSalePayment(body, channel, saleDate, moneySource) {
  const status =
    body.paymentStatus === 'paid' || body.paymentStatus === 'unpaid'
      ? body.paymentStatus
      : defaultPaymentStatus(channel)
  const methodRaw = String(body.paymentMethod || '')
  const paymentMethod = METHODS.includes(methodRaw) ? methodRaw : defaultPaymentMethod(channel, status)
  const paidAt = status === 'paid' ? String(body.paidAt || saleDate || '').slice(0, 10) || null : null
  const parsed = {
    paymentStatus: status,
    paymentMethod: status === 'paid' ? paymentMethod : null,
    paidAt
  }
  const hasDiscount =
    body.discountAmount != null ||
    body.discountPercent != null ||
    body.discountKind === 'amount' ||
    body.discountKind === 'percent'
  if (hasDiscount) {
    Object.assign(parsed, resolveDiscount(body, afterFeeOf(moneySource || body)))
  }
  if (body.paymentNotes != null) {
    parsed.paymentNotes = sanitizeText(String(body.paymentNotes)) || null
  }
  return parsed
}

export function saleMoney({ salePricePerUnit, quantity, marketplaceFeePercent, discountAmount }) {
  const qty = Math.max(Math.round(Number(quantity) || 0), 0)
  const price = Math.max(Math.round(Number(salePricePerUnit) || 0), 0)
  const feePct = Math.min(Math.max(Number(marketplaceFeePercent) || 0, 0), 100)
  const gross = price * qty
  const fee = Math.round(gross * (feePct / 100))
  const afterFee = Math.max(gross - fee, 0)
  const discount = Math.min(Math.max(Math.round(Number(discountAmount) || 0), 0), afterFee)
  return { gross, fee, discount, net: afterFee - discount }
}
