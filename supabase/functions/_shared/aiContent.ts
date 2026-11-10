export const GENERATOR_MODEL = 'google/gemma-4-31b-it:free'
export const REVIEWER_MODEL = 'nvidia/nemotron-3.5-super-vl:free'

const CATEGORIES = new Set(['fundamentals', 'web-api', 'scenarios'])
const DIFFICULTIES = new Set(['Начальный', 'Средний', 'Сложный'])
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/
const TELEGRAM_USER_ID = /^[1-9][0-9]{0,15}$/

export function isSoleAdmin(configuredIds: string | undefined, telegramUserId: string) {
  if (!TELEGRAM_USER_ID.test(telegramUserId)) return false
  const ids = (configuredIds ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  return ids.length === 1 && TELEGRAM_USER_ID.test(ids[0]) && ids[0] === telegramUserId
}

export function isZeroPricedModel(model: unknown, expectedId: string) {
  if (!model || typeof model !== 'object') return false
  const value = model as Record<string, unknown>
  const pricing = value.pricing
  if (value.id !== expectedId || !pricing || typeof pricing !== 'object') return false
  const prices = pricing as Record<string, unknown>
  return ['string', 'number'].includes(typeof prices.prompt)
    && ['string', 'number'].includes(typeof prices.completion)
    && Number.isFinite(Number(prices.prompt))
    && Number.isFinite(Number(prices.completion))
    && Number(prices.prompt) === 0
    && Number(prices.completion) === 0
}

export function createOpenRouterHeaders(apiKey: string, appUrl?: string): Headers {
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${apiKey}`)
  headers.set('Content-Type', 'application/json')
  if (appUrl) headers.set('HTTP-Referer', appUrl)
  headers.set('X-Title', 'QA na paltsakh')
  return headers
}

export function modelRequestFailureCode(status: number) {
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? `model_request_${status}`
    : 'model_request_failed'
}

export function validateGenerationRequest(value: Record<string, unknown>) {
  if (typeof value.topic !== 'string' || value.topic.trim().length < 3 || value.topic.length > 300) return null
  if (typeof value.category !== 'string' || !CATEGORIES.has(value.category)) return null
  if (typeof value.difficulty !== 'string' || !DIFFICULTIES.has(value.difficulty)) return null
  return { topic: value.topic.trim(), category: value.category, difficulty: value.difficulty }
}

export function validateGeneratedQuestion(value: unknown, category: string, difficulty: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const question = value as Record<string, unknown>
  if (typeof question.question !== 'string' || question.question.trim().length < 10 || question.question.length > 1000) return null
  if (!Array.isArray(question.options) || question.options.length !== 4) return null
  const options = question.options.map((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return null
    const item = option as Record<string, unknown>
    if (typeof item.id !== 'string' || !SAFE_ID.test(item.id) || typeof item.text !== 'string' || item.text.trim().length < 1 || item.text.length > 500) return null
    return { id: item.id, text: item.text.trim() }
  })
  if (options.some((option) => option === null) || new Set(options.map((option) => option?.id)).size !== 4) return null
  if (typeof question.correctOptionId !== 'string' || !options.some((option) => option?.id === question.correctOptionId)) return null
  if (typeof question.explanation !== 'string' || question.explanation.trim().length < 10 || question.explanation.length > 3000) return null
  if (typeof question.hint !== 'string' || question.hint.length > 1000) return null

  return {
    category,
    difficulty,
    question: question.question.trim(),
    options,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation.trim(),
    hint: question.hint.trim(),
  }
}

export function reviewerPayload(question: Record<string, unknown>) {
  return {
    category: question.category,
    difficulty: question.difficulty,
    question: question.question,
    options: question.options,
  }
}

export function validateReview(value: unknown, optionIds: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const review = value as Record<string, unknown>
  if (typeof review.approved !== 'boolean' || typeof review.correctOptionId !== 'string' || !optionIds.includes(review.correctOptionId)) return null
  if (typeof review.rationale !== 'string' || review.rationale.length > 1200) return null
  if (!Array.isArray(review.issues) || review.issues.length > 5
    || !review.issues.every((issue) => typeof issue === 'string' && issue.length <= 240)) return null
  return {
    approved: review.approved,
    correctOptionId: review.correctOptionId,
    rationale: review.rationale,
    issues: review.issues,
  }
}

export function parseModelJson(content: unknown) {
  if (typeof content !== 'string' || content.length > 12_000) throw new Error('invalid_model_response')
  return JSON.parse(content)
}
