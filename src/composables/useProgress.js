import { computed, reactive, ref, watch } from 'vue'
import { createId, createSession, validateAnswer } from '../lib/quizEngine.js'
import { createInitialProgress, loadProgress, resetProgress, saveProgress } from '../lib/progressStorage.js'
import { utcDateKey } from '../lib/dailyTask.js'
import { cloudStats, cloudStatus, connectTelegram, createCloudQuizSession, getAuthenticatedTelegramInitData, isServerScoringRequired, resetCloudProgress, serverScoringIsActive, submitCloudAttempt } from '../lib/cloudApi.js'

const loaded = loadProgress()
const progress = reactive(loaded.progress)
const storageWarning = ref(loaded.recovered)
const pendingSync = ref(progress.pendingCloudAttempts.length > 0)

watch(progress, (value) => {
  storageWarning.value = !saveProgress(value)
}, { deep: true })

const accuracy = computed(() => progress.answeredCount
  ? Math.round((progress.correctCount / progress.answeredCount) * 100)
  : 0)

const currentStreak = computed(() => {
  const completedDays = new Set(progress.dailyCompletions)
  let date = new Date()
  const today = utcDateKey(date)

  if (!completedDays.has(today)) date = new Date(Date.now() - 24 * 60 * 60 * 1000)

  let streak = 0
  while (completedDays.has(utcDateKey(date))) {
    streak += 1
    date = new Date(date.getTime() - 24 * 60 * 60 * 1000)
  }
  return streak
})

const achievements = computed(() => [
  { id: 'first-answer', title: 'Первый шаг', description: 'Ответить на первый вопрос', icon: 'sparkles', earned: progress.answeredCount >= 1 },
  { id: 'ten-correct', title: 'Точный глаз', description: 'Дать 10 правильных ответов', icon: 'target', earned: progress.correctCount >= 10 },
  { id: 'daily-streak', title: 'В ритме', description: 'Решать QA Daily 5 дней подряд', icon: 'flame', earned: currentStreak.value >= 5 },
  { id: 'hundred-xp', title: 'Сотня опыта', description: 'Набрать 100 XP', icon: 'award', earned: progress.xp >= 100 },
])

function applyServerStats(stats) {
  progress.xp = stats.xp
  progress.answeredCount = stats.answeredCount
  progress.correctCount = stats.correctCount
  progress.completedQuestionIds = [...stats.completedQuestionIds]
  progress.dailyCompletions = [...stats.dailyCompletions]
}

async function syncPendingAttempts() {
  if (!serverScoringIsActive()) return false
  for (const attempt of [...progress.pendingCloudAttempts]) {
    try {
      const result = await submitCloudAttempt(attempt)
      const sessionEntry = Object.entries(progress.activeSessions).find(([, session]) => session.sessionId === attempt.sessionId)
      if (!sessionEntry) continue
      const session = sessionEntry[1]
      if (!session.answers.some(({ attemptId }) => attemptId === attempt.attemptId)) {
        session.answers.push({
          questionId: attempt.questionId,
          selectedOptionId: attempt.selectedOptionId,
          correct: result.isCorrect,
          correctOptionId: result.correctOptionId,
          explanation: result.explanation,
          attemptId: attempt.attemptId,
        })
      }
      applyServerStats(result.progress)
      progress.pendingCloudAttempts = progress.pendingCloudAttempts.filter(({ attemptId }) => attemptId !== attempt.attemptId)
    } catch {
      break
    }
  }
  pendingSync.value = progress.pendingCloudAttempts.length > 0
  return !pendingSync.value
}

async function beginSession(mode, pool, size = 10, dailyDate = null) {
  const session = createSession(pool, size)

  if (serverScoringIsActive()) {
    const request = mode === 'practice'
      ? { mode: 'practice', size }
      : mode.startsWith('interview-')
        ? { mode, size }
        : mode.startsWith('theory-')
          ? { mode: 'theory', size: 1, questionId: pool[0]?.id }
          : mode.startsWith('daily-')
            ? { mode: 'daily', size: 1, dailyDate }
            : null

      if (!request) throw new Error('Для этой тренировки нет серверного режима. Переподключите сессию.')
    const serverSession = await createCloudQuizSession(request)
    const poolIds = new Set(pool.map(({ id }) => id))
    if (!serverSession.items.every(({ questionId }) => poolIds.has(questionId))) throw new Error('Сервер вернул неизвестный вопрос.')
    session.sessionId = serverSession.sessionId
    session.questionIds = serverSession.items.map(({ questionId }) => questionId)
    session.optionOrders = Object.fromEntries(serverSession.items.map(({ questionId, optionIds }) => [questionId, optionIds]))
    session.attemptIds = Object.fromEntries(session.questionIds.map((id) => [id, createId()]))
    session.serverVerified = true
  }

  progress.activeSessions[mode] = session
  return session
}

async function submitSessionAnswer(mode, question, optionId, dailyDate = null) {
  const session = progress.activeSessions[mode]
  if (!session) return null
  if (serverScoringIsActive() && !session.serverVerified) {
    return { pending: true, error: 'Эта тренировка началась до подключения к серверу. Создайте новый набор, чтобы ответ засчитался.' }
  }

  const existingAnswer = session.answers.find(({ questionId }) => questionId === question.id)
  if (existingAnswer) return existingAnswer

  const attempt = {
    attemptId: session.attemptIds[question.id],
    sessionId: session.sessionId,
    questionId: question.id,
    selectedOptionId: optionId,
    category: question.category,
    dailyDate,
  }
  let correct
  let correctOptionId = question.correctOptionId
  let explanation = question.explanation

  if (serverScoringIsActive()) {
    try {
      const result = await submitCloudAttempt(attempt)
      correct = result.isCorrect
      correctOptionId = result.correctOptionId
      explanation = result.explanation
      Object.assign(cloudStats.value, result.progress)
    } catch {
      if (!progress.pendingCloudAttempts.some(({ attemptId }) => attemptId === attempt.attemptId)
        && progress.pendingCloudAttempts.length < 100) progress.pendingCloudAttempts.push(attempt)
      pendingSync.value = true
      return { pending: true, error: 'Не удалось сохранить ответ на сервере. Ответ не засчитан. Проверьте соединение и нажмите «Повторить отправку».' }
    }
  } else {
    if (isServerScoringRequired()) return { pending: true, error: 'Нет связи с сервером подтверждения. Ответ не засчитан. Повторите попытку, когда соединение восстановится.' }
    correct = validateAnswer(question, optionId)
  }

  const answer = { questionId: question.id, selectedOptionId: optionId, correct, correctOptionId, explanation, attemptId: attempt.attemptId }
  session.answers.push(answer)
  progress.answeredCount = Math.min(1_000_000_000, progress.answeredCount + 1)
  progress.correctCount = Math.min(1_000_000_000, progress.correctCount + Number(correct))
  progress.xp = Math.min(1_000_000_000, progress.xp + (correct ? 10 : 3))
  if (!progress.completedQuestionIds.includes(question.id)) progress.completedQuestionIds.push(question.id)
  progress.pendingCloudAttempts = progress.pendingCloudAttempts.filter(({ attemptId }) => attemptId !== attempt.attemptId)
  pendingSync.value = progress.pendingCloudAttempts.length > 0
  return answer
}

async function retryPendingAttempt(mode, question) {
  const activeSession = progress.activeSessions[mode]
  const attempt = progress.pendingCloudAttempts.find(({ questionId, sessionId }) => questionId === question.id && sessionId === activeSession?.sessionId)
  if (!attempt) {
    try {
      await authenticateTelegram()
      return { pending: true, error: 'Сессия восстановлена. Начните новую тренировку, чтобы получить серверное подтверждение.' }
    } catch {
      return { pending: true, error: 'Сессию Telegram пока не удалось проверить. Попробуйте ещё раз.' }
    }
  }
  if (!serverScoringIsActive()) return { pending: true, error: 'Сначала необходимо восстановить проверенную сессию Telegram.' }

  try {
    const result = await submitCloudAttempt(attempt)
    const session = progress.activeSessions[mode]
    if (!session || session.sessionId !== attempt.sessionId) throw new Error('Сессия изменилась')
    session.answers.push({
      questionId: question.id,
      selectedOptionId: attempt.selectedOptionId,
      correct: result.isCorrect,
      correctOptionId: result.correctOptionId,
      explanation: result.explanation,
      attemptId: attempt.attemptId,
    })
    applyServerStats(result.progress)
    progress.pendingCloudAttempts = progress.pendingCloudAttempts.filter(({ attemptId }) => attemptId !== attempt.attemptId)
    pendingSync.value = progress.pendingCloudAttempts.length > 0
    return session.answers.at(-1)
  } catch {
    pendingSync.value = true
    return { pending: true, error: 'Ответ пока не удалось отправить. Проверьте соединение и повторите попытку.' }
  }
}

function advanceSession(mode, dailyDate = null) {
  const session = progress.activeSessions[mode]
  if (!session) return

  session.currentIndex += 1
  if (session.currentIndex >= session.questionIds.length) {
    session.completed = true
    if (dailyDate) completeDaily(dailyDate)
  }
}

function completeDaily(date = utcDateKey()) {
  if (!progress.dailyCompletions.includes(date)) progress.dailyCompletions.push(date)
}

function setTheme(theme) {
  if (['system', 'light', 'dark'].includes(theme)) progress.theme = theme
}

async function clearProgress() {
  if (serverScoringIsActive()) {
    const stats = await resetCloudProgress()
    applyServerStats(stats)
  } else if (isServerScoringRequired()) {
    throw new Error('Не удалось проверить сессию. Облачный прогресс не сброшен.')
  }
  resetProgress()
  Object.assign(progress, createInitialProgress())
  pendingSync.value = false
}

async function authenticateTelegram() {
  const initData = getAuthenticatedTelegramInitData()
  if (!initData) return false
  const authenticated = await connectTelegram(initData)
  if (authenticated && cloudStats.value) {
    applyServerStats(cloudStats.value)
    await syncPendingAttempts()
  }
  return authenticated
}

export function useProgress() {
  return {
    progress,
    storageWarning,
    pendingSync,
    cloudStatus,
    cloudStats,
    accuracy,
    currentStreak,
    achievements,
    beginSession,
    submitSessionAnswer,
    retryPendingAttempt,
    advanceSession,
    authenticateTelegram,
    syncPendingAttempts,
    setTheme,
    clearProgress,
  }
}