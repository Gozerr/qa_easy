import { createId } from './quizEngine.js'

export const STORAGE_KEY = 'qa-na-paltsakh:progress'
export const STORAGE_VERSION = 7

const MAX_STORAGE_CHARS = 256_000
const MAX_COUNT = 1_000_000_000
const MAX_COMPLETED_QUESTIONS = 1_000
const MAX_DAILY_COMPLETIONS = 10_000
const MAX_ACTIVE_SESSIONS = 50
const MAX_SESSION_QUESTIONS = 100
const MAX_PENDING_ATTEMPTS = 100
const MAX_XP_TRANSACTIONS = 500
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUtcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

export function createInitialProgress() {
  return {
    version: STORAGE_VERSION,
    xp: 0,
    answeredCount: 0,
    correctCount: 0,
    completedQuestionIds: [],
    dailyCompletions: [],
    activeSessions: {},
    pendingCloudAttempts: [],
    completedLessonIds: [],
    achievementDates: {},
    practiceResults: {},
    lessonPractices: {},
    xpTransactions: [],
    theme: 'system',
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function normalizeProgress(value) {
  if (!value || ![1, 2, 3, 4, 5, 6, STORAGE_VERSION].includes(value.version)) return null
  const migrating = value.version < STORAGE_VERSION
  if (!Number.isSafeInteger(value.xp) || !Number.isSafeInteger(value.answeredCount) || !Number.isSafeInteger(value.correctCount)) return null
  if (value.xp < 0 || value.answeredCount < 0 || value.correctCount < 0 || value.correctCount > value.answeredCount) return null
  if (value.xp > MAX_COUNT || value.answeredCount > MAX_COUNT || value.correctCount > MAX_COUNT) return null
  if (!Array.isArray(value.completedQuestionIds) || !Array.isArray(value.dailyCompletions)) return null
  if (!value.activeSessions || typeof value.activeSessions !== 'object' || Array.isArray(value.activeSessions)) return null
  if (value.completedQuestionIds.length > MAX_COMPLETED_QUESTIONS || value.dailyCompletions.length > MAX_DAILY_COMPLETIONS) return null
  if (Object.keys(value.activeSessions).length > MAX_ACTIVE_SESSIONS) return null
  if (value.version >= 2 && (!Array.isArray(value.pendingCloudAttempts) || value.pendingCloudAttempts.length > MAX_PENDING_ATTEMPTS)) return null
  if (value.version === STORAGE_VERSION && !Array.isArray(value.completedLessonIds)) return null
  if (value.version === STORAGE_VERSION && (!value.achievementDates || typeof value.achievementDates !== 'object' || Array.isArray(value.achievementDates))) return null
  if (value.achievementDates && (typeof value.achievementDates !== 'object' || Array.isArray(value.achievementDates) || Object.keys(value.achievementDates).length > 100)) return null
  if (value.version === STORAGE_VERSION && (!value.practiceResults || typeof value.practiceResults !== 'object' || Array.isArray(value.practiceResults))) return null
  if (value.practiceResults && (typeof value.practiceResults !== 'object' || Array.isArray(value.practiceResults) || Object.keys(value.practiceResults).length > 1_000)) return null
  if (value.version === STORAGE_VERSION && (!value.lessonPractices || typeof value.lessonPractices !== 'object' || Array.isArray(value.lessonPractices))) return null
  if (value.lessonPractices && (typeof value.lessonPractices !== 'object' || Array.isArray(value.lessonPractices) || Object.keys(value.lessonPractices).length > 1_000)) return null
  if (value.version === STORAGE_VERSION && (!Array.isArray(value.xpTransactions) || value.xpTransactions.length > MAX_XP_TRANSACTIONS)) return null

  const activeSessions = Object.fromEntries(Object.entries(value.activeSessions).flatMap(([mode, session]) => {
    if (!SAFE_ID.test(mode)) return []
    if (!session || !Array.isArray(session.questionIds) || !session.questionIds.every((id) => typeof id === 'string')) return []
    if (session.questionIds.length === 0 || session.questionIds.length > MAX_SESSION_QUESTIONS) return []
    if (!session.questionIds.every((id) => SAFE_ID.test(id))) return []
    if (new Set(session.questionIds).size !== session.questionIds.length) return []
    if (!Number.isInteger(session.currentIndex) || session.currentIndex < 0 || session.currentIndex > session.questionIds.length) return []
    if (typeof session.completed !== 'boolean' || !Array.isArray(session.answers)) return []
    if (session.answers.length > session.questionIds.length || (session.completed && session.currentIndex !== session.questionIds.length)) return []
    if (!session.optionOrders || typeof session.optionOrders !== 'object' || Array.isArray(session.optionOrders)) return []

    const sessionId = typeof session.sessionId === 'string' && UUID.test(session.sessionId)
      ? session.sessionId
      : migrating ? createId() : null
    if (!sessionId) return []

    const optionOrders = Object.fromEntries(session.questionIds.flatMap((id) => {
      const optionIds = session.optionOrders[id]
      if (!Array.isArray(optionIds) || !optionIds.every((optionId) => typeof optionId === 'string')) return []
      if (optionIds.length < 2 || optionIds.length > 12 || !optionIds.every((optionId) => SAFE_ID.test(optionId))) return []
      if (new Set(optionIds).size !== optionIds.length) return []
      return [[id, optionIds]]
    }))
    if (Object.keys(optionOrders).length !== session.questionIds.length) return []

    const answers = []
    const answeredQuestionIds = new Set()
    for (const answer of session.answers) {
      if (!answer || !session.questionIds.includes(answer.questionId) || answeredQuestionIds.has(answer.questionId)) continue
      if (!optionOrders[answer.questionId]?.includes(answer.selectedOptionId) || typeof answer.correct !== 'boolean') continue
      answers.push({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        correct: answer.correct,
        ...(SAFE_ID.test(answer.correctOptionId ?? '') ? { correctOptionId: answer.correctOptionId } : {}),
        ...(typeof answer.explanation === 'string' && answer.explanation.length <= 3_000 ? { explanation: answer.explanation } : {}),
      })
      answeredQuestionIds.add(answer.questionId)
    }

    let attemptIds = session.attemptIds
    if (!attemptIds && migrating) attemptIds = Object.fromEntries(session.questionIds.map((id) => [id, createId()]))
    if (!attemptIds || typeof attemptIds !== 'object' || Array.isArray(attemptIds)) return []
    if (!session.questionIds.every((id) => UUID.test(attemptIds[id]))) return []

    return [[mode, {
      sessionId,
      questionIds: session.questionIds,
      optionOrders,
      attemptIds: Object.fromEntries(session.questionIds.map((id) => [id, attemptIds[id]])),
      currentIndex: session.currentIndex,
      answers,
      completed: session.completed,
      serverVerified: session.serverVerified === true,
    }]]
  }))

  const pendingCloudAttempts = value.version < 2 ? [] : value.pendingCloudAttempts.filter((attempt) => attempt
    && UUID.test(attempt.attemptId)
    && UUID.test(attempt.sessionId)
    && SAFE_ID.test(attempt.questionId)
    && SAFE_ID.test(attempt.selectedOptionId)
    && ['fundamentals', 'web-api', 'scenarios'].includes(attempt.category)
    && (attempt.dailyDate === null || isUtcDate(attempt.dailyDate)))

  return {
    ...createInitialProgress(),
    xp: Math.max(0, value.xp),
    answeredCount: Math.max(0, value.answeredCount),
    correctCount: Math.max(0, value.correctCount),
    completedQuestionIds: [...new Set(value.completedQuestionIds.filter((id) => typeof id === 'string' && SAFE_ID.test(id)))],
    dailyCompletions: [...new Set(value.dailyCompletions.filter(isUtcDate))],
    activeSessions,
    pendingCloudAttempts,
    completedLessonIds: [...new Set((Array.isArray(value.completedLessonIds) ? value.completedLessonIds : []).filter((id) => typeof id === 'string' && SAFE_ID.test(id)))],
    achievementDates: Object.fromEntries(Object.entries(value.achievementDates ?? {}).filter(([id, date]) => SAFE_ID.test(id) && isIsoTimestamp(date))),
    practiceResults: Object.fromEntries(Object.entries(value.practiceResults ?? {}).flatMap(([id, result]) => {
      if (!SAFE_ID.test(id) || !result || typeof result !== 'object') return []
      if (!Number.isInteger(result.bestScore) || result.bestScore < 0 || result.bestScore > 100 || !isIsoTimestamp(result.completedAt)) return []
      return [[id, { bestScore: result.bestScore, completedAt: result.completedAt }]]
    })),
    lessonPractices: Object.fromEntries(Object.entries(value.lessonPractices ?? {}).flatMap(([id, result]) => {
      if (!SAFE_ID.test(id) || !result || typeof result !== 'object' || !isIsoTimestamp(result.completedAt)) return []
      const scenario = typeof result.scenario === 'string' ? result.scenario.trim().slice(0, 1_500) : ''
      const steps = typeof result.steps === 'string' ? result.steps.trim().slice(0, 1_500) : ''
      const expected = typeof result.expected === 'string' ? result.expected.trim().slice(0, 1_500) : ''
      if (!scenario || !steps || !expected) return []
      return [[id, { scenario, steps, expected, completedAt: result.completedAt }]]
    })),
    xpTransactions: (Array.isArray(value.xpTransactions) ? value.xpTransactions : []).flatMap((transaction) => {
      if (!transaction || typeof transaction !== 'object' || !SAFE_ID.test(transaction.id)
        || !['answer', 'weekly-mission'].includes(transaction.source)
        || typeof transaction.title !== 'string' || !transaction.title.trim() || transaction.title.length > 120
        || !Number.isSafeInteger(transaction.amount) || transaction.amount < 1 || transaction.amount > 500
        || !isIsoTimestamp(transaction.createdAt)) return []
      return [{ id: transaction.id, source: transaction.source, title: transaction.title.trim(), amount: transaction.amount, createdAt: transaction.createdAt }]
    }).slice(-MAX_XP_TRANSACTIONS),
    theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
  }
}

export function loadProgress(storage = browserStorage()) {
  if (!storage) return { progress: createInitialProgress(), recovered: true }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return { progress: createInitialProgress(), recovered: false }
    if (raw.length > MAX_STORAGE_CHARS) return { progress: createInitialProgress(), recovered: true }

    const parsed = JSON.parse(raw)
    const progress = normalizeProgress(parsed)
    if (!progress) return { progress: createInitialProgress(), recovered: true }
    if (parsed.version !== STORAGE_VERSION) saveProgress(progress, storage)
    return { progress, recovered: false }
  } catch {
    return { progress: createInitialProgress(), recovered: true }
  }
}

export function saveProgress(progress, storage = browserStorage()) {
  if (!storage) return false
  try {
    const normalized = normalizeProgress({ ...progress, version: STORAGE_VERSION })
    if (!normalized) return false
    const serialized = JSON.stringify(normalized)
    if (serialized.length > MAX_STORAGE_CHARS) return false
    storage.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function resetProgress(storage = browserStorage()) {
  if (!storage) return false
  try {
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
