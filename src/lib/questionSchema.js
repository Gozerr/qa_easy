export const QUESTION_CATEGORIES = Object.freeze(['fundamentals', 'web-api', 'scenarios'])
export const QUESTION_DIFFICULTIES = Object.freeze(['Начальный', 'Средний', 'Сложный'])

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

function validText(value, maxLength) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maxLength
    && !CONTROL_CHARACTERS.test(value)
}

export function validateQuestion(value, { requireAnswer = true, allowedCategories = QUESTION_CATEGORIES } = {}) {
  const errors = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, question: null, errors: ['Вопрос должен быть объектом'] }

  if (typeof value.id !== 'string' || !SAFE_ID.test(value.id)) errors.push('Некорректный ID вопроса')
  if (!allowedCategories.includes(value.category)) errors.push('Неизвестная категория вопроса')
  if (!QUESTION_DIFFICULTIES.includes(value.difficulty)) errors.push('Неизвестная сложность вопроса')
  if (!validText(value.question, 1_000)) errors.push('Некорректный текст вопроса')
  if (!validText(value.explanation, 3_000)) errors.push('Некорректное объяснение')
  if (value.hint !== undefined && !validText(value.hint, 1_000)) errors.push('Некорректная подсказка')
  if (value.interviewLevel !== undefined && !['junior', 'middle'].includes(value.interviewLevel)) errors.push('Неизвестный уровень собеседования')

  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 12) {
    errors.push('В вопросе должно быть от 2 до 12 вариантов')
  } else {
    const optionIds = value.options.map((option) => option?.id)
    if (optionIds.some((id) => typeof id !== 'string' || !SAFE_ID.test(id))) errors.push('Некорректный ID варианта')
    if (new Set(optionIds).size !== optionIds.length) errors.push('ID вариантов должны быть уникальными')
    if (value.options.some((option) => !validText(option?.text, 500))) errors.push('Некорректный текст варианта')
  }

  if (requireAnswer && (typeof value.correctOptionId !== 'string' || !value.options?.some((option) => option?.id === value.correctOptionId))) {
    errors.push('Правильный вариант должен ссылаться на существующий ID')
  }

  if (errors.length) return { valid: false, question: null, errors }

  return {
    valid: true,
    errors,
    question: {
      id: value.id,
      category: value.category,
      difficulty: value.difficulty,
      question: value.question.trim(),
      options: value.options.map(({ id, text }) => ({ id, text: text.trim() })),
      ...(requireAnswer ? { correctOptionId: value.correctOptionId } : {}),
      explanation: value.explanation.trim(),
      ...(value.hint ? { hint: value.hint.trim() } : {}),
      ...(value.interviewLevel ? { interviewLevel: value.interviewLevel } : {}),
    },
  }
}

export function validateQuestionDataset(questions, { allowedCategories = QUESTION_CATEGORIES, requireAnswer = true } = {}) {
  if (!Array.isArray(questions) || questions.length > 1_000) {
    return { valid: false, errors: ['Банк вопросов должен содержать не более 1000 записей'] }
  }

  const errors = []
  const ids = new Set()
  questions.forEach((question, index) => {
    const result = validateQuestion(question, { allowedCategories, requireAnswer })
    if (!result.valid) errors.push(...result.errors.map((error) => `Вопрос ${index + 1}: ${error}`))
    if (typeof question?.id === 'string' && ids.has(question.id)) errors.push(`Повторяется ID вопроса: ${question.id}`)
    if (typeof question?.id === 'string') ids.add(question.id)
  })

  return { valid: errors.length === 0, errors }
}

export function normalizeQuestion(value, { requireAnswer = true, allowedCategories = QUESTION_CATEGORIES } = {}) {
  const result = validateQuestion(value, { requireAnswer, allowedCategories })
  return result.valid ? result.question : null
}