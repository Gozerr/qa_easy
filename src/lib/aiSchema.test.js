import { describe, expect, it } from 'vitest'
import { normalizeAiDraft } from './aiSchema.js'
import {
  parseModelJson,
  reviewerPayload,
  validateGeneratedQuestion,
  validateGenerationRequest,
  validateReview,
} from '../../supabase/functions/_shared/aiContent.ts'

const draftQuestion = {
  question: 'Какой результат должен дать идемпотентный запрос при повторе?',
  options: [
    { id: 'a', text: 'Тот же эффект, что и при первом выполнении' },
    { id: 'b', text: 'Всегда создавать новую сущность' },
    { id: 'c', text: 'Отклоняться только из-за повтора' },
    { id: 'd', text: 'Менять тело запроса' },
  ],
  correctOptionId: 'a',
  explanation: 'Идемпотентная операция сохраняет тот же итоговый эффект при повторном выполнении.',
  hint: 'Сравните итоговый эффект.',
}

describe('AI content validation', () => {
  it('accepts only bounded generation inputs and a complete four-option question', () => {
    expect(validateGenerationRequest({ topic: ' HTTP idempotency ', category: 'web-api', difficulty: 'Средний' }))
      .toEqual({ topic: 'HTTP idempotency', category: 'web-api', difficulty: 'Средний' })
    expect(validateGenerationRequest({ topic: 'x', category: 'web-api', difficulty: 'Средний' })).toBeNull()
    expect(validateGenerationRequest({ topic: 'Valid topic', category: 'unknown', difficulty: 'Средний' })).toBeNull()
    expect(validateGeneratedQuestion(draftQuestion, 'web-api', 'Средний')).toMatchObject({ correctOptionId: 'a' })
    expect(validateGeneratedQuestion({ ...draftQuestion, options: draftQuestion.options.slice(0, 3) }, 'web-api', 'Средний')).toBeNull()
  })

  it('builds a blind reviewer payload without the generator answer or explanation', () => {
    const payload = reviewerPayload({ ...draftQuestion, category: 'web-api', difficulty: 'Средний' })
    expect(payload).toEqual({
      category: 'web-api',
      difficulty: 'Средний',
      question: draftQuestion.question,
      options: draftQuestion.options,
    })
    expect(payload).not.toHaveProperty('correctOptionId')
    expect(payload).not.toHaveProperty('explanation')
    expect(payload).not.toHaveProperty('hint')
  })

  it('rejects malformed reviewer/model payloads and validates bounded admin drafts', () => {
    expect(validateReview({ approved: true, correctOptionId: 'missing', rationale: '', issues: [] }, ['a', 'b'])).toBeNull()
    expect(validateReview({ approved: true, correctOptionId: 'a', rationale: 'Уточнено.', issues: [] }, ['a', 'b']))
      .toMatchObject({ approved: true, correctOptionId: 'a' })
    expect(() => parseModelJson('```json{}')).toThrow()
    expect(normalizeAiDraft({
      id: 'not-a-uuid', topic: 'topic', category: 'web-api', difficulty: 'Средний', status: 'approved',
      revisionCount: 0, content: draftQuestion,
    })).toBeNull()
  })
})
