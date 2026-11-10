import { computed, reactive, ref, watch } from 'vue'
import { createId, createSession, validateAnswer } from '../lib/quizEngine.js'
import { createInitialProgress, loadProgress, resetProgress, saveProgress } from '../lib/progressStorage.js'
import { utcDateKey } from '../lib/dailyTask.js'
import { theoryTopics } from '../data/theory.js'
import { qaProjects, scoreProject } from '../data/qaProjects.js'
import { validateDailyChallenge } from '../lib/dailyChallenge.js'
import { claimCloudWeeklyMission, cloudProfile, cloudStats, cloudStatus, connectTelegram, createCloudQuizSession, fetchArenaLeaderboard as fetchCloudArenaLeaderboard, fetchCloudXpHistory, fetchSkillComparison as fetchCloudSkillComparison, fetchWeeklyMissions, getAuthenticatedTelegramInitData, isServerScoringRequired, resetCloudProgress, saveCloudLessonProgress, serverScoringIsActive, submitCloudArenaResult, submitCloudAttempt } from '../lib/cloudApi.js'

const SAFE_LESSON_ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const SAFE_ACTIVITY_ID = /^[a-z0-9][a-z0-9-]{0,79}$/

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

function achievement(id, title, description, icon, category, current, target, rarity = 'Обычное') {
  const value = Math.min(target, current)
  return { id, title, description, icon, category, rarity, current: value, target, earned: current >= target, percent: Math.min(100, Math.round(current / target * 100)) }
}

const achievements = computed(() => {
  const completedLessons = new Set(progress.completedLessonIds)
  const finishedModules = theoryTopics.filter(({ lessons }) => lessons.every(({ id }) => completedLessons.has(id))).length
  const designLessons = theoryTopics.find(({ id }) => id === 'test-design')?.lessons ?? []
  const accuracyReady = progress.answeredCount >= 10
  const completedActivities = Object.values(progress.practiceResults).filter(({ bestScore }) => bestScore >= 75)
  const passedProjects = qaProjects.filter(({ id }) => progress.projectProgress[id]?.bestScore >= 75).length

  return [
    achievement('first-answer', 'Первый шаг', 'Ответить на первый вопрос', 'sparkles', 'Практика', progress.answeredCount, 1),
    achievement('first-correct', 'Попал в точку', 'Правильно ответить хотя бы один раз', 'target', 'Практика', progress.correctCount, 1),
    achievement('ten-answers', 'Разогрев', 'Дать 10 ответов', 'message', 'Практика', progress.answeredCount, 10),
    achievement('twenty-five-answers', 'Вошёл в ритм', 'Дать 25 ответов', 'message', 'Практика', progress.answeredCount, 25, 'Необычное'),
    achievement('hundred-answers', 'Практик', 'Дать 100 ответов', 'target', 'Практика', progress.answeredCount, 100, 'Редкое'),
    achievement('ten-correct', 'Точный глаз', 'Дать 10 правильных ответов', 'target', 'Точность', progress.correctCount, 10),
    achievement('twenty-five-correct', 'Верная стратегия', 'Дать 25 правильных ответов', 'target', 'Точность', progress.correctCount, 25, 'Необычное'),
    achievement('fifty-correct', 'QA-снайпер', 'Дать 50 правильных ответов', 'target', 'Точность', progress.correctCount, 50, 'Редкое'),
    achievement('ninety-accuracy', 'Чистое попадание', 'Точность не ниже 90% после 10 ответов', 'award', 'Точность', accuracyReady && accuracy.value >= 90 ? 1 : 0, 1, 'Редкое'),
    achievement('ten-unique-questions', 'Широкий взгляд', 'Решить 10 разных вопросов', 'layers', 'Практика', progress.completedQuestionIds.length, 10, 'Необычное'),
    achievement('twenty-five-unique-questions', 'Исследователь', 'Решить 25 разных вопросов', 'search', 'Практика', progress.completedQuestionIds.length, 25, 'Редкое'),
    achievement('first-practice', 'Практика началась', 'Завершить интерактивное упражнение с зачётным результатом', 'target', 'Практика', completedActivities.length, 1),
    achievement('first-detective', 'Первое расследование', 'Найти причину и собрать доказательства в QA Detective', 'search', 'Практика', Object.entries(progress.practiceResults).filter(([id, result]) => id.startsWith('detective-') && result.bestScore >= 85).length, 1, 'Необычное'),
    achievement('first-test-case', 'Проектировщик проверок', 'Собрать полный набор тест-кейсов', 'layers', 'Практика', Object.entries(progress.practiceResults).some(([id, result]) => id.startsWith('case-constructor-') && result.bestScore === 100) ? 1 : 0, 1, 'Необычное'),
    achievement('first-bug-report', 'Баг описан', 'Составить полный воспроизводимый баг-репорт', 'message', 'Практика', Object.entries(progress.practiceResults).some(([id, result]) => id.startsWith('bug-report-') && result.bestScore === 100) ? 1 : 0, 1, 'Необычное'),
    achievement('first-arena', 'Первый выход на арену', 'Завершить сезонное испытание с результатом от 70%', 'trophy', 'Соревнования', progress.practiceResults['arena-scenarios']?.bestScore >= 70 ? 1 : 0, 1, 'Необычное'),
    achievement('first-lesson', 'Открыл теорию', 'Отметить первый урок изученным', 'book', 'Обучение', completedLessons.size, 1),
    achievement('five-lessons', 'Учусь системно', 'Отметить пять уроков изученными', 'book', 'Обучение', completedLessons.size, 5),
    achievement('ten-lessons', 'Ученик QA', 'Изучить 10 уроков', 'book', 'Обучение', completedLessons.size, 10, 'Необычное'),
    achievement('twenty-five-lessons', 'Крепкая база', 'Изучить 25 уроков', 'book', 'Обучение', completedLessons.size, 25, 'Редкое'),
    achievement('all-lessons', 'Карта пройдена', 'Изучить все уроки программы', 'trophy', 'Обучение', completedLessons.size, theoryTopics.reduce((sum, topic) => sum + topic.lessons.length, 0), 'Эпическое'),
    achievement('first-module', 'Модуль закрыт', 'Завершить все уроки одного модуля', 'layers', 'Обучение', finishedModules, 1, 'Необычное'),
    achievement('three-modules', 'Системный подход', 'Завершить три учебных модуля', 'layers', 'Обучение', finishedModules, 3, 'Редкое'),
    achievement('test-design-module', 'Арсенал тест-дизайна', 'Изучить все уроки по тест-дизайну', 'target', 'Обучение', designLessons.length && designLessons.every(({ id }) => completedLessons.has(id)) ? 1 : 0, 1, 'Редкое'),
    achievement('first-daily', 'На сегодня готово', 'Выполнить QA Daily', 'calendar', 'Регулярность', progress.dailyCompletions.length, 1),
    achievement('seven-dailies', 'Неделя практики', 'Выполнить QA Daily в 7 разных дней', 'calendar', 'Регулярность', progress.dailyCompletions.length, 7, 'Необычное'),
    achievement('thirty-dailies', 'Постоянство', 'Выполнить QA Daily в 30 разных дней', 'calendar', 'Регулярность', progress.dailyCompletions.length, 30, 'Редкое'),
    achievement('three-day-streak', 'Три дня в деле', 'Заниматься 3 дня подряд', 'flame', 'Регулярность', currentStreak.value, 3),
    achievement('weekly-streak', 'В ритме', 'Заниматься 7 дней подряд', 'flame', 'Регулярность', currentStreak.value, 7, 'Необычное'),
    achievement('monthly-streak', 'Не сбавляя темп', 'Заниматься 30 дней подряд', 'flame', 'Регулярность', currentStreak.value, 30, 'Эпическое'),
    achievement('hundred-xp', 'Сотня опыта', 'Набрать 100 XP', 'zap', 'Опыт', progress.xp, 100),
    achievement('five-hundred-xp', 'Опытный тестировщик', 'Набрать 500 XP', 'zap', 'Опыт', progress.xp, 500, 'Необычное'),
    achievement('thousand-xp', 'Тысяча опыта', 'Набрать 1 000 XP', 'award', 'Опыт', progress.xp, 1_000, 'Редкое'),
    achievement('two-thousand-xp', 'Мастер практики', 'Набрать 2 500 XP', 'trophy', 'Опыт', progress.xp, 2_500, 'Эпическое'),
    achievement('first-project', 'Первый проект', 'Набрать не меньше 75% в сквозном проекте', 'layers', 'Обучение', passedProjects, 1, 'Необычное'),
    achievement('three-projects', 'Готов к Middle', 'Набрать не меньше 75% во всех трёх сквозных проектах', 'trophy', 'Обучение', passedProjects, qaProjects.length, 'Эпическое'),
  ].map((item) => ({ ...item, earnedAt: progress.achievementDates[item.id] ?? null }))
})

watch(achievements, (items, previousItems) => {
  const previouslyEarned = new Set((previousItems ?? []).filter(({ earned }) => earned).map(({ id }) => id))
  const earnedAt = new Date().toISOString()
  for (const item of items) {
    if (item.earned && !previouslyEarned.has(item.id) && !progress.achievementDates[item.id]) progress.achievementDates[item.id] = earnedAt
  }
})

function markLessonComplete(lessonId) {
  if (typeof lessonId !== 'string' || !SAFE_LESSON_ID.test(lessonId)) return false
  if (!progress.completedLessonIds.includes(lessonId)) progress.completedLessonIds.push(lessonId)
  if (serverScoringIsActive()) void saveCloudLessonProgress([lessonId]).catch(() => {})
  return true
}

async function syncCompletedLessons() {
  if (!serverScoringIsActive() || progress.completedLessonIds.length === 0) return false
  try {
    await saveCloudLessonProgress(progress.completedLessonIds)
    return true
  } catch {
    return false
  }
}

function recordLessonPractice(lessonId, response) {
  if (typeof lessonId !== 'string' || !SAFE_LESSON_ID.test(lessonId) || !response || typeof response !== 'object') return false
  const scenario = typeof response.scenario === 'string' ? response.scenario.trim() : ''
  const steps = typeof response.steps === 'string' ? response.steps.trim() : ''
  const expected = typeof response.expected === 'string' ? response.expected.trim() : ''
  if (!scenario || !steps || !expected || [scenario, steps, expected].some((value) => value.length > 1_500)) return false
  progress.lessonPractices[lessonId] = { scenario, steps, expected, completedAt: new Date().toISOString() }
  markLessonComplete(lessonId)
  return true
}

function recordPracticeResult(activityId, score) {
  if (typeof activityId !== 'string' || !SAFE_ACTIVITY_ID.test(activityId) || !Number.isInteger(score) || score < 0 || score > 100) return false
  const current = progress.practiceResults[activityId]
  if (!current || score > current.bestScore) {
    progress.practiceResults[activityId] = { bestScore: score, completedAt: new Date().toISOString() }
  }
  if (activityId === 'arena-scenarios' || activityId.startsWith('marathon-')) {
    const completedAt = new Date().toISOString()
    const season = completedAt.slice(0, 7)
    const results = progress.seasonalResults[season] ??= {}
    const seasonal = results[activityId]
    results[activityId] = { bestScore: Math.max(seasonal?.bestScore ?? 0, score), completedAt }
    for (const oldSeason of Object.keys(progress.seasonalResults).sort().slice(0, -12)) delete progress.seasonalResults[oldSeason]
  }
  return true
}

function recordProjectAnswer(projectId, taskId, optionId) {
  const project = qaProjects.find(({ id }) => id === projectId)
  const task = project?.tasks.find(({ id }) => id === taskId)
  if (!task?.options.some(({ id }) => id === optionId)) return null
  const entry = progress.projectProgress[projectId] ??= { answers: {}, bestScore: 0, completedAt: null }
  entry.answers[taskId] = optionId
  const result = scoreProject(project, entry.answers)
  if (result.complete) {
    entry.bestScore = Math.max(entry.bestScore, result.score)
    entry.completedAt = new Date().toISOString()
  }
  return { ...result, bestScore: entry.bestScore, completedAt: entry.completedAt }
}

function recordLocalXpTransaction({ id, title, amount }) {
  if (!SAFE_ACTIVITY_ID.test(id) || typeof title !== 'string' || !title.trim()
    || !Number.isSafeInteger(amount) || amount < 1 || amount > 500) return false
  if (progress.xpTransactions.some((transaction) => transaction.id === id)) return true
  progress.xpTransactions.push({ id, source: 'answer', title: title.trim().slice(0, 120), amount, createdAt: new Date().toISOString() })
  if (progress.xpTransactions.length > 500) progress.xpTransactions.splice(0, progress.xpTransactions.length - 500)
  return true
}

async function getXpHistory(limit = 50) {
  if (serverScoringIsActive()) return fetchCloudXpHistory(limit)
  return progress.xpTransactions.slice(-limit).reverse()
}

async function getSkillComparison() {
  if (!serverScoringIsActive()) return null
  return fetchCloudSkillComparison()
}

async function getArenaLeaderboard(challengeId = 'scenario-investigation') {
  if (!serverScoringIsActive()) return null
  return fetchCloudArenaLeaderboard(challengeId)
}

async function submitArenaResult(sessionId, attemptIds, challengeId = 'scenario-investigation') {
  if (!serverScoringIsActive()) throw new Error('Официальный результат требует подтверждённой сессии Telegram.')
  return submitCloudArenaResult({ sessionId, attemptIds, challengeId })
}

function applyServerStats(stats) {
  progress.xp = stats.xp
  progress.answeredCount = stats.answeredCount
  progress.correctCount = stats.correctCount
  progress.completedQuestionIds = [...stats.completedQuestionIds]
  progress.dailyCompletions = [...new Set([...stats.dailyCompletions, ...Object.keys(progress.dailyChallenges)])]
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
    const request = mode === 'practice' || mode === 'arena'
      ? { mode: 'practice', size }
      : mode.startsWith('interview-')
        ? { mode, size }
        : mode.startsWith('marathon-')
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
    recordLocalXpTransaction({ id: attempt.attemptId, title: question.question, amount: correct ? 10 : 3 })
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

function recordDailyChallenge(date, activityType, response) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const timestamp = Date.parse(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return false
  const cleanResponse = validateDailyChallenge(activityType, response)
  if (!cleanResponse) return false
  progress.dailyChallenges[date] = { activityType, response: cleanResponse, completedAt: new Date().toISOString() }
  for (const oldDate of Object.keys(progress.dailyChallenges).sort().slice(0, -90)) delete progress.dailyChallenges[oldDate]
  completeDaily(date)
  return true
}

async function getWeeklyMissions(weekStart) {
  if (!serverScoringIsActive()) return null
  return fetchWeeklyMissions(weekStart)
}

async function claimWeeklyMission(missionId, weekStart) {
  if (!serverScoringIsActive()) throw new Error('Награду можно получить в проверенной сессии Telegram.')
  const result = await claimCloudWeeklyMission({ missionId, weekStart })
  applyServerStats(result.progress)
  return result
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
    cloudProfile,
    accuracy,
    currentStreak,
    achievements,
    beginSession,
    submitSessionAnswer,
    retryPendingAttempt,
    advanceSession,
    getWeeklyMissions,
    claimWeeklyMission,
    getXpHistory,
    getSkillComparison,
    syncCompletedLessons,
    getArenaLeaderboard,
    submitArenaResult,
    authenticateTelegram,
    syncPendingAttempts,
    setTheme,
    markLessonComplete,
    recordLessonPractice,
    recordPracticeResult,
    recordProjectAnswer,
    recordDailyChallenge,
    clearProgress,
  }
}
