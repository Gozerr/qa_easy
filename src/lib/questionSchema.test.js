import { describe, expect, it } from 'vitest'
import { questions } from '../data/questions.js'
import { validateQuestion, validateQuestionDataset } from './questionSchema.js'

describe('content validation', () => {
  it('accepts the shipped bank and preserves its full answer-ID contract', () => {
    expect(validateQuestionDataset(questions).valid).toBe(true)
    const result = validateQuestion(questions[0])
    expect(result.question.correctOptionId).toBe(questions[0].correctOptionId)
  })

  it('rejects duplicate question IDs, duplicate option IDs, bad categories and dangling correct IDs', () => {
    const duplicate = structuredClone(questions[0])
    duplicate.options[1].id = duplicate.options[0].id
    duplicate.correctOptionId = 'not-an-option'

    const result = validateQuestionDataset([questions[0], { ...questions[0], question: 'Повтор' }, { ...duplicate, id: 'bad-question', category: 'unknown' }])
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('Повторяется ID вопроса'))).toBe(true)
    expect(result.errors.some((error) => error.includes('уникальными'))).toBe(true)
    expect(result.errors.some((error) => error.includes('существующий ID'))).toBe(true)
    expect(result.errors.some((error) => error.includes('категория'))).toBe(true)
    expect(validateQuestion({ ...questions[0], options: [null, ...questions[0].options.slice(1)] }).valid).toBe(false)
  })

  it('keeps HTML-like content as plain text data and strips unrecognized fields', () => {
    const input = {
      ...questions[0],
      question: '<img src=x onerror=alert(1)>',
      adminOnly: 'unexpected',
    }
    const result = validateQuestion(input)
    expect(result.valid).toBe(true)
    expect(result.question.question).toBe('<img src=x onerror=alert(1)>')
    expect(result.question.adminOnly).toBeUndefined()
  })

  it('validates remote questions without exposing or requiring the answer key', () => {
    const { correctOptionId: _correctOptionId, ...publicQuestion } = questions[0]
    const result = validateQuestion(publicQuestion, { requireAnswer: false })
    expect(result.valid).toBe(true)
    expect(result.question.correctOptionId).toBeUndefined()
  })
})