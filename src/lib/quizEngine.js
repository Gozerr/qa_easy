import { validateQuestionDataset } from './questionSchema.js'

export function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function shuffle(items, random = Math.random) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random()
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) throw new RangeError('Random source must return a value in [0, 1)')
    const swapIndex = Math.floor(randomValue * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

export function validateAnswer(question, selectedOptionId) {
  if (typeof selectedOptionId !== 'string' || typeof question?.correctOptionId !== 'string') return false
  if (!Array.isArray(question.options) || !question.options.some((option) => option?.id === selectedOptionId)) return false
  return selectedOptionId === question.correctOptionId
}

export function createSession(pool, size = 10, random = Math.random) {
  if (!Array.isArray(pool) || pool.length === 0 || pool.length > 1_000) throw new TypeError('Question pool must contain 1 to 1000 questions')
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) throw new RangeError('Session size must be an integer from 1 to 100')
  const requireAnswer = pool.some((question) => typeof question?.correctOptionId === 'string')
  const validation = validateQuestionDataset(pool, { requireAnswer })
  if (!validation.valid) throw new TypeError('Question pool failed validation')
  const uniqueQuestions = [...new Map(pool.map((question) => [question.id, question])).values()]
  const selectedQuestions = shuffle(uniqueQuestions, random).slice(0, Math.min(size, uniqueQuestions.length))
  const questionIds = selectedQuestions.map(({ id }) => id)
  const optionOrders = Object.fromEntries(selectedQuestions.map(({ id, options }) => [
    id,
    shuffle(options, random).map(({ id: optionId }) => optionId),
  ]))

  return {
    sessionId: createId(),
    questionIds,
    optionOrders,
    attemptIds: Object.fromEntries(questionIds.map((id) => [id, createId()])),
    currentIndex: 0,
    answers: [],
    completed: false,
  }
}

export function getSessionQuestion(pool, session, index = session.currentIndex) {
  if (!Array.isArray(pool) || !session || !Array.isArray(session.questionIds)
    || !Number.isInteger(index) || index < 0 || index >= session.questionIds.length) return null
  const questionId = session.questionIds[index]
  const question = pool.find(({ id }) => id === questionId)
  if (!question) return null

  const optionOrder = session.optionOrders[questionId] ?? []
  const optionsById = new Map(question.options.map((option) => [option.id, option]))

  const options = optionOrder.map((optionId) => optionsById.get(optionId)).filter(Boolean)
  if (options.length !== question.options.length || new Set(optionOrder).size !== question.options.length) return null

  return {
    ...question,
    options,
  }
}