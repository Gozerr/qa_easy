import { ref, shallowRef } from 'vue'
import { normalizeQuestion } from './questionSchema.js'
import { normalizeAiDraft } from './aiSchema.js'
import { isSupabaseConfigured, supabaseClient } from './supabaseClient.js'

const MAX_COUNTER = 1_000_000_000
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEADERBOARD_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u

export const cloudStatus = ref(isSupabaseConfigured ? 'browser' : 'unconfigured')
export const cloudError = ref('')
export const cloudStats = shallowRef(null)
export const cloudQuestions = shallowRef([])
export const cloudDailyTask = shallowRef(null)
export const cloudProfile = shallowRef(null)

let accessToken = null

function safeCounter(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

export function normalizeTelegramProfile(value) {
  if (!value || typeof value !== 'object' || typeof value.firstName !== 'string' || value.firstName.trim().length === 0 || value.firstName.length > 128) return null
  const profile = {
    firstName: value.firstName.trim(),
    lastName: typeof value.lastName === 'string' && value.lastName.length <= 128 ? value.lastName.trim() : '',
    username: typeof value.username === 'string' && value.username.length <= 64 ? value.username.trim() : '',
    avatarUrl: null,
  }
  if (typeof value.avatarUrl === 'string' && value.avatarUrl.length <= 2_048) {
    try {
      const url = new URL(value.avatarUrl)
      if (url.protocol === 'https:') profile.avatarUrl = url.href
    } catch {
      profile.avatarUrl = null
    }
  }
  return profile
}

export function normalizeServerStats(value) {
  if (!value || typeof value !== 'object') return null
  if (!safeCounter(value.xp) || !safeCounter(value.answeredCount) || !safeCounter(value.correctCount)) return null
  if (value.correctCount > value.answeredCount || !safeCounter(value.currentStreak) || !safeCounter(value.longestStreak)) return null
  if (!Array.isArray(value.completedQuestionIds) || value.completedQuestionIds.length > 1_000) return null
  if (!Array.isArray(value.dailyCompletions) || value.dailyCompletions.length > 10_000) return null
  if (!value.completedQuestionIds.every((id) => typeof id === 'string' && SAFE_ID.test(id))) return null
  if (!value.dailyCompletions.every(validDate)) return null

  return {
    xp: value.xp,
    answeredCount: value.answeredCount,
    correctCount: value.correctCount,
    completedQuestionIds: [...new Set(value.completedQuestionIds)],
    dailyCompletions: [...new Set(value.dailyCompletions)],
    currentStreak: value.currentStreak,
    longestStreak: value.longestStreak,
  }
}

export function normalizeLeaderboard(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.entries) || value.entries.length > 50) return null
  if (!Number.isSafeInteger(value.totalParticipants) || value.totalParticipants < 0 || value.totalParticipants > MAX_COUNTER) return null
  if (value.currentUserRank !== null && (!Number.isSafeInteger(value.currentUserRank) || value.currentUserRank < 1 || value.currentUserRank > value.totalParticipants)) return null
  if (!value.preferences || typeof value.preferences.enabled !== 'boolean'
    || typeof value.preferences.displayName !== 'string'
    || (value.preferences.displayName !== '' && !LEADERBOARD_NAME.test(value.preferences.displayName))) return null

  const entries = []
  let previousRank = 0
  for (const entry of value.entries) {
    if (!entry || !Number.isSafeInteger(entry.rank) || entry.rank <= previousRank || entry.rank > value.totalParticipants
      || typeof entry.displayName !== 'string' || !LEADERBOARD_NAME.test(entry.displayName)
      || !Number.isSafeInteger(entry.xp) || entry.xp < 0 || entry.xp > MAX_COUNTER
      || !Number.isSafeInteger(entry.answeredCount) || entry.answeredCount < 0 || entry.answeredCount > MAX_COUNTER
      || !Number.isSafeInteger(entry.accuracy) || entry.accuracy < 0 || entry.accuracy > 100
      || (entry.avatarUrl !== undefined && entry.avatarUrl !== null && (typeof entry.avatarUrl !== 'string' || entry.avatarUrl.length > 2_048))) return null
    previousRank = entry.rank
    let avatarUrl = null
    if (typeof entry.avatarUrl === 'string') {
      try {
        const parsed = new URL(entry.avatarUrl)
        if (parsed.protocol === 'https:') avatarUrl = parsed.href
      } catch {
        avatarUrl = null
      }
    }
    entries.push({
      rank: entry.rank,
      displayName: entry.displayName,
      xp: entry.xp,
      answeredCount: entry.answeredCount,
      accuracy: entry.accuracy,
      avatarUrl,
    })
  }

  return {
    entries,
    currentUserRank: value.currentUserRank,
    totalParticipants: value.totalParticipants,
    preferences: { enabled: value.preferences.enabled, displayName: value.preferences.displayName },
  }
}

function invokeFailure() {
  return new Error('Не удалось связаться с сервером. Выбранный ответ сохранён локально, попробуйте ещё раз.')
}

export async function connectTelegram(initData) {
  if (!isSupabaseConfigured || !supabaseClient) {
    cloudStatus.value = 'unconfigured'
    return false
  }
  if (typeof initData !== 'string' || initData.length === 0 || initData.length > 8_192) {
    cloudStatus.value = 'browser'
    return false
  }

  cloudStatus.value = 'connecting'
  cloudError.value = ''
  try {
    const { data, error } = await supabaseClient.functions.invoke('telegram-auth', { body: { initData } })
    if (error || typeof data?.accessToken !== 'string' || data.accessToken.length > 4_096) throw invokeFailure()
    const stats = normalizeServerStats(data.progress)
    if (!stats) throw invokeFailure()

    accessToken = data.accessToken
    cloudStats.value = stats
    cloudProfile.value = normalizeTelegramProfile(data.profile)
    cloudStatus.value = 'ready'
    
    try {
      const [questions, task] = await Promise.all([fetchCloudQuestions(), fetchCloudDailyTask()])
      cloudQuestions.value = questions
      cloudDailyTask.value = task
    } catch {
      cloudError.value = 'Сессия подтверждена, но учебные данные не загрузились. Проверьте seed и повторите подключение.'
    }
    return true
  } catch {
    accessToken = null
    cloudProfile.value = null
    cloudStatus.value = 'error'
    cloudError.value = 'Не удалось проверить сессию Telegram. Прогресс не будет засчитан без ответа сервера.'
    throw invokeFailure()
  }
}

async function invokeAuthenticated(body, functionName = 'quiz-api') {
  if (!supabaseClient || !accessToken) throw invokeFailure()
  try {
    const { data, error } = await supabaseClient.functions.invoke(functionName, {
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (error || !data || typeof data !== 'object') throw invokeFailure()
    return data
  } catch {
    cloudError.value = 'Синхронизация временно недоступна. Попробуйте отправить ответ ещё раз.'
    throw invokeFailure()
  }
}

export async function submitCloudAttempt(attempt) {
  if (!UUID.test(attempt?.attemptId) || !UUID.test(attempt?.sessionId)) throw new TypeError('Некорректный ID попытки')
  if (!SAFE_ID.test(attempt?.questionId) || !SAFE_ID.test(attempt?.selectedOptionId)) throw new TypeError('Некорректный ID ответа')
  const result = await invokeAuthenticated({
    action: 'submit_attempt',
    attemptId: attempt.attemptId,
    sessionId: attempt.sessionId,
    questionId: attempt.questionId,
    selectedOptionId: attempt.selectedOptionId,
    dailyDate: attempt.dailyDate ?? null,
  })

  if (typeof result.isCorrect !== 'boolean' || !SAFE_ID.test(result.correctOptionId) || typeof result.explanation !== 'string' || result.explanation.length > 3_000) {
    throw invokeFailure()
  }
  const stats = normalizeServerStats(result.progress)
  if (!stats) throw invokeFailure()
  cloudStats.value = stats
  cloudError.value = ''
  return { isCorrect: result.isCorrect, correctOptionId: result.correctOptionId, explanation: result.explanation, progress: stats }
}

export async function fetchCloudQuestions({ category, difficulty } = {}) {
  const data = await invokeAuthenticated({ action: 'get_questions', category, difficulty })
  if (!Array.isArray(data.questions) || data.questions.length > 50) throw invokeFailure()
  return data.questions.map((question) => normalizeQuestion(question, { requireAnswer: false })).filter(Boolean)
}

export async function fetchCloudDailyTask() {
  const data = await invokeAuthenticated({ action: 'get_daily' })
  const task = data.task
  if (!task || !validDate(task.date) || !SAFE_ID.test(task.id) || typeof task.title !== 'string' || task.title.length > 160
    || typeof task.description !== 'string' || task.description.length > 1_200
    || !task.content || !SAFE_ID.test(task.content.questionId)) {
    throw invokeFailure()
  }
  return task
}

export async function fetchLeaderboard() {
  const data = await invokeAuthenticated({ action: 'get_leaderboard' })
  const leaderboard = normalizeLeaderboard(data)
  if (!leaderboard) throw invokeFailure()
  return leaderboard
}

export async function fetchLeaderboardPreferences() {
  const data = await invokeAuthenticated({ action: 'get_leaderboard_preferences' })
  const preferences = data.preferences
  if (!preferences || typeof preferences.enabled !== 'boolean' || typeof preferences.displayName !== 'string'
    || (preferences.displayName !== '' && !LEADERBOARD_NAME.test(preferences.displayName))) throw invokeFailure()
  return { enabled: preferences.enabled, displayName: preferences.displayName }
}

export async function updateLeaderboardPreferences({ enabled, displayName }) {
  const data = await invokeAuthenticated({ action: 'update_leaderboard', enabled, displayName })
  const preferences = data.preferences
  if (!preferences || typeof preferences.enabled !== 'boolean' || typeof preferences.displayName !== 'string'
    || (preferences.displayName !== '' && !LEADERBOARD_NAME.test(preferences.displayName))) throw invokeFailure()
  return { enabled: preferences.enabled, displayName: preferences.displayName }
}

export async function refreshCloudProgress() {
  const data = await invokeAuthenticated({ action: 'get_progress' })
  const stats = normalizeServerStats(data.progress)
  if (!stats) throw invokeFailure()
  cloudStats.value = stats
  return stats
}

export function isServerScoringRequired() {
  return isSupabaseConfigured && ['connecting', 'error'].includes(cloudStatus.value)
}

export function serverScoringIsActive() {
  return cloudStatus.value === 'ready'
}

export function getAuthenticatedTelegramInitData() {
  const raw = typeof window === 'undefined' ? '' : window.Telegram?.WebApp?.initData
  return typeof raw === 'string' && raw.length <= 8_192 ? raw : ''
}

export async function createCloudQuizSession({ mode, size, dailyDate = null, questionId = null }) {
  const result = await invokeAuthenticated({ action: 'create_session', mode, size, dailyDate, questionId })
  if (!UUID.test(result.sessionId) || !Array.isArray(result.items) || result.items.length === 0 || result.items.length > 10) {
    throw invokeFailure()
  }
  const questionIds = new Set()
  const items = result.items.map((item) => {
    if (!SAFE_ID.test(item?.questionId) || questionIds.has(item.questionId)
      || !Array.isArray(item.optionIds) || item.optionIds.length < 2 || item.optionIds.length > 12
      || !item.optionIds.every((id) => SAFE_ID.test(id)) || new Set(item.optionIds).size !== item.optionIds.length) {
      throw invokeFailure()
    }
    questionIds.add(item.questionId)
    return { questionId: item.questionId, optionIds: [...item.optionIds] }
  })
  return { sessionId: result.sessionId, items }
}

export async function resetCloudProgress() {
  const data = await invokeAuthenticated({ action: 'reset_progress' })
  const stats = normalizeServerStats(data.progress)
  if (!stats || stats.xp !== 0 || stats.answeredCount !== 0 || stats.completedQuestionIds.length !== 0) throw invokeFailure()
  cloudStats.value = stats
  return stats
}

export async function fetchAiAdminStatus() {
  const data = await invokeAuthenticated({ action: 'status' }, 'ai-admin')
  if (typeof data.authorized !== 'boolean' || typeof data.enabled !== 'boolean') throw invokeFailure()
  return { authorized: data.authorized, enabled: data.enabled }
}

export async function fetchAiDrafts() {
  const data = await invokeAuthenticated({ action: 'list' }, 'ai-admin')
  if (!Array.isArray(data.drafts) || data.drafts.length > 50) throw invokeFailure()
  const drafts = data.drafts.map(normalizeAiDraft)
  if (drafts.some((draft) => !draft)) throw invokeFailure()
  return drafts
}

export async function generateAiDraft({ topic, category, difficulty }) {
  const data = await invokeAuthenticated({ action: 'generate', topic, category, difficulty }, 'ai-admin')
  const draft = normalizeAiDraft(data.draft)
  if (!draft || !['approved', 'rejected'].includes(draft.status)) throw invokeFailure()
  return draft
}

export async function publishAiDraft(draftId) {
  if (!UUID.test(draftId)) throw new TypeError('Некорректный ID черновика')
  const data = await invokeAuthenticated({ action: 'publish', draftId }, 'ai-admin')
  if (data.status !== 'published' || !SAFE_ID.test(data.questionId)) throw invokeFailure()
  return data.questionId
}
