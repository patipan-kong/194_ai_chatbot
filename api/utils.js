export function calculateInteractionCost (models, { modelId, inputTokens, outputTokens }) {
  const model = models.find(m => m.id === modelId)
  const inputPricePer1M = model?.cost?.token_1m?.input
  const outputPricePer1M = model?.cost?.token_1m?.output

  if (typeof inputPricePer1M !== 'number' || typeof outputPricePer1M !== 'number') {
    return 0
  }

  const inputPrice = inputPricePer1M / 1_000_000
  const outputPrice = outputPricePer1M / 1_000_000
  const inTokens = Number.isFinite(inputTokens) ? inputTokens : 0
  const outTokens = Number.isFinite(outputTokens) ? outputTokens : 0

  return (inTokens * inputPrice) + (outTokens * outputPrice)
}