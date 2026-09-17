import {
  DEFAULT_MARGIN_PERCENT,
  DEFAULT_PRICE_ROUND_STEP,
  sellingPriceFrom,
  suggestedPrettyPrice
} from './hpp.js'

export function decorateProductPricing(product, hppResult, settings) {
  const marginPercent = settings?.defaultMarginPercent ?? DEFAULT_MARGIN_PERCENT
  const roundStep = settings?.priceRoundStep ?? DEFAULT_PRICE_ROUND_STEP
  const hasRecipe = (hppResult?.recipeRows?.length ?? 0) > 0
  const hpp = hppResult?.total ?? 0
  const listPrice = Math.max(Math.round(Number(product.listPrice) || 0), 0)
  const suggestedPrice = hasRecipe ? suggestedPrettyPrice(hpp, marginPercent, roundStep) : 0
  return {
    hpp,
    hasRecipe,
    listPrice,
    suggestedPrice,
    sellingPrice: sellingPriceFrom({
      hpp,
      listPrice,
      marginPercent,
      roundStep,
      hasRecipe
    }),
    marginPercent,
    priceRoundStep: roundStep
  }
}
