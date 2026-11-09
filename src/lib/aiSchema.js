const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CATEGORIES = new Set(['fundamentals', 'web-api', 'scenarios'])
const DIFFICULTIES = new Set(['Начальный', 'Средний', 'Сложный'])
const STATUSES = new Set(['generating', 'approved', 'rejected', 'failed', 'published'])
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/

export function normalizeAiDraft(value) {
  if (!value || typeof value !== 'object' || !UUID.test(value.id)
    || typeof value.topic !== 'string' || value.topic.length > 300
    || !CATEGORIES.has(value.category) || !DIFFICULTIES.has(value.difficulty)
    || !STATUSES.has(value.status) || !Number.isInteger(value.revisionCount ?? value.revision_count)
    || (value.revisionCount ?? value.revision_count) < 0 || (value.revisionCount ?? value.revision_count) > 2) return null

  let content = null
  if (value.content !== null && value.content !== undefined) {
    const item = value.content
    if (!item || typeof item !== 'object' || typeof item.question !== 'string' || item.question.length > 1000
      || !Array.isArray(item.options) || item.options.length !== 4
      || !item.options.every((option) => option && SAFE_ID.test(option.id) && typeof option.text === 'string' && option.text.length <= 500)
      || new Set(item.options.map((option) => option.id)).size !== 4
      || !SAFE_ID.test(item.correctOptionId) || !item.options.some((option) => option.id === item.correctOptionId)
      || typeof item.explanation !== 'string' || item.explanation.length > 3000
      || typeof item.hint !== 'string' || item.hint.length > 1000) return null
    content = item
  }

  let review = null
  if (value.review !== null && value.review !== undefined) {
    const item = value.review
    if (!item || typeof item !== 'object' || typeof item.approved !== 'boolean'
      || !SAFE_ID.test(item.correctOptionId) || typeof item.rationale !== 'string' || item.rationale.length > 1200
      || !Array.isArray(item.issues) || item.issues.length > 5
      || !item.issues.every((issue) => typeof issue === 'string' && issue.length <= 240)) return null
    review = item
  }

  return {
    id: value.id,
    topic: value.topic,
    category: value.category,
    difficulty: value.difficulty,
    status: value.status,
    content,
    review,
    revisionCount: value.revisionCount ?? value.revision_count,
    publishedQuestionId: value.publishedQuestionId ?? value.published_question_id ?? null,
    failureCode: value.failureCode ?? value.failure_code ?? null,
    generatorModel: typeof (value.generatorModel ?? value.generator_model) === 'string' ? (value.generatorModel ?? value.generator_model) : '',
    reviewerModel: typeof (value.reviewerModel ?? value.reviewer_model) === 'string' ? (value.reviewerModel ?? value.reviewer_model) : '',
    createdAt: typeof (value.createdAt ?? value.created_at) === 'string' ? (value.createdAt ?? value.created_at) : '',
  }
}
