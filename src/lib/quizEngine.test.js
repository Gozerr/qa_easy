import { describe, expect, it } from 'vitest'
import { createSession, shuffle, validateAnswer } from './quizEngine.js'
import { getDailyTask } from './dailyTask.js'
import { createInitialProgress, loadProgress, saveProgress, STORAGE_KEY } from './progressStorage.js'
import { categories, questions } from '../data/questions.js'
import { dailyTasks } from '../data/dailyTasks.js'
import { theoryTopics } from '../data/theory.js'

function createQuestions(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `question-${index}`,
    category: 'fundamentals',
    difficulty: 'Начальный',
    question: `Вопрос ${index}`,
    options: [
      { id: 'first', text: 'Первый' },
      { id: 'second', text: 'Второй' },
    ],
    correctOptionId: 'second',
    explanation: 'Разбор ответа.',
  }))
}

function memoryStorage(initialValue = null) {
  const values = new Map(initialValue === null ? [] : [[STORAGE_KEY, initialValue]])
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

describe('quiz engine', () => {
  it('ships 30 distinct, complete questions with ten in each category', () => {
    expect(questions).toHaveLength(30)
    expect(new Set(questions.map(({ id }) => id)).size).toBe(30)
    expect(new Set(questions.map(({ question }) => question.trim().toLocaleLowerCase('ru'))).size).toBe(30)
    for (const { id, category, difficulty, question, options, correctOptionId, explanation } of questions) {
      expect(id).toBeTruthy()
      expect(categories.map(({ id: categoryId }) => categoryId)).toContain(category)
      expect(difficulty).toBeTruthy()
      expect(question).toBeTruthy()
      expect(explanation).toBeTruthy()
      expect(new Set(options.map(({ id: optionId }) => optionId)).size).toBe(options.length)
      expect(options.map(({ id: optionId }) => optionId)).toContain(correctOptionId)
    }
    for (const { id } of categories) expect(questions.filter((question) => question.category === id)).toHaveLength(10)
  })

  it('ships 30 distinct daily tasks linked to valid questions', () => {
    expect(dailyTasks).toHaveLength(30)
    expect(new Set(dailyTasks.map(({ id }) => id)).size).toBe(30)
    expect(dailyTasks.every(({ title, prompt, questionId, activityType }) => title && prompt && ['question', 'test-design', 'bug-report'].includes(activityType) && questions.some(({ id }) => id === questionId))).toBe(true)
    expect(new Set(dailyTasks.map(({ activityType }) => activityType))).toEqual(new Set(['question', 'test-design', 'bug-report']))
  })

  it('provides lesson material needed for a practical task in all 50 lessons', () => {
    const lessons = theoryTopics.flatMap(({ lessons: moduleLessons }) => moduleLessons)
    expect(lessons).toHaveLength(50)
    expect(new Set(lessons.map(({ id }) => id)).size).toBe(50)
    expect(lessons.every(({ id, heading, example, pitfall }) => id && heading && example && pitfall)).toBe(true)
  })

  it('shuffles with Fisher–Yates while preserving every item', () => {
    const result = shuffle([1, 2, 3, 4], () => 0)
    expect(result).toEqual([2, 3, 4, 1])
    expect([...result].sort()).toEqual([1, 2, 3, 4])
  })

  it('validates answers by stable option ID, not visible position', () => {
    const question = createQuestions(1)[0]
    expect(validateAnswer(question, 'second')).toBe(true)
    expect(validateAnswer(question, 'first')).toBe(false)
    expect(validateAnswer(question, 'missing')).toBe(false)
  })

  it('creates a unique selection and records shuffled option IDs', () => {
    const pool = createQuestions(8)
    const session = createSession(pool, 6, () => 0.42)
    expect(session.questionIds).toHaveLength(6)
    expect(new Set(session.questionIds).size).toBe(6)
    expect(session.questionIds.every((id) => session.optionOrders[id].length === 2)).toBe(true)
    expect(session.attemptIds[session.questionIds[0]]).toMatch(/^[0-9a-f-]{36}$/)
    expect(createSession(pool.map(({ correctOptionId: _correctOptionId, ...question }) => question), 4).questionIds).toHaveLength(4)
    expect(() => createSession([...pool, pool[0]], 6)).toThrow('failed validation')
    expect(() => createSession(pool, 0)).toThrow(RangeError)
    expect(() => shuffle([1, 2], () => 1)).toThrow(RangeError)
  })

  it('maps each UTC date to one stable daily task', () => {
    const tasks = Array.from({ length: 30 }, (_, index) => ({ id: `daily-${index}` }))
    expect(getDailyTask('2026-11-09', tasks)).toEqual(getDailyTask('2026-11-09', tasks))
    expect(getDailyTask('2026-11-09', tasks)).not.toEqual(getDailyTask('2026-11-10', tasks))
    expect(new Set(Array.from({ length: 30 }, (_, day) => {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10)
      return getDailyTask(date, tasks).id
    })).size).toBe(30)
    expect(() => getDailyTask('2026-02-30', tasks)).toThrow(TypeError)
    expect(() => getDailyTask('2026-01-01T10:00:00Z', tasks)).toThrow(TypeError)
  })

  it('recovers safely from corrupted storage and round-trips valid data', () => {
    const broken = loadProgress(memoryStorage('{broken json'))
    expect(broken.recovered).toBe(true)
    expect(broken.progress).toEqual(createInitialProgress())

    const storage = memoryStorage()
    const progress = { ...createInitialProgress(), xp: 25 }
    expect(saveProgress(progress, storage)).toBe(true)
    expect(loadProgress(storage)).toEqual({ progress, recovered: false })
  })

  it('migrates schema v1 sessions and rejects oversized or unsafe counters', () => {
    const storage = memoryStorage(JSON.stringify({
      ...createInitialProgress(),
      version: 1,
      activeSessions: {
        practice: {
          questionIds: ['qa-01'],
          optionOrders: { 'qa-01': ['a', 'b', 'c', 'd'] },
          currentIndex: 0,
          answers: [],
          completed: false,
        },
      },
    }))
    const migrated = loadProgress(storage)
    expect(migrated.recovered).toBe(false)
    expect(migrated.progress.version).toBe(11)
    expect(migrated.progress.activeSessions.practice.sessionId).toBeTruthy()
    expect(loadProgress(storage).progress.activeSessions.practice.questionIds).toEqual(['qa-01'])

    const tooLarge = memoryStorage('x'.repeat(256_001))
    expect(loadProgress(tooLarge).recovered).toBe(true)
    const unsafeCounter = memoryStorage(JSON.stringify({ ...createInitialProgress(), xp: Number.MAX_SAFE_INTEGER + 2 }))
    expect(loadProgress(unsafeCounter).recovered).toBe(true)
  })

  it('migrates existing lesson progress and initializes achievement dates', () => {
    const storage = memoryStorage(JSON.stringify({
      ...createInitialProgress(),
      version: 6,
      xp: 150,
      completedLessonIds: ['basics-qa', 'sql-model'],
    }))

    const migrated = loadProgress(storage)
    expect(migrated.recovered).toBe(false)
    expect(migrated.progress.version).toBe(11)
    expect(migrated.progress.xp).toBe(150)
    expect(migrated.progress.completedLessonIds).toEqual(['basics-qa', 'sql-model'])
    expect(migrated.progress.achievementDates).toEqual({})
    expect(migrated.progress.lessonPractices).toEqual({})
    expect(migrated.progress.xpTransactions).toEqual([])
  })

  it('round-trips lesson practice responses and rejects incomplete or oversized records', () => {
    const valid = {
      ...createInitialProgress(),
      lessonPractices: { 'basics-qa': { scenario: 'Повторить запрос', steps: 'Отправить дважды', expected: 'Создан один заказ', completedAt: '2026-11-10T10:00:00.000Z' } },
    }
    const storage = memoryStorage()
    expect(saveProgress(valid, storage)).toBe(true)
    expect(loadProgress(storage).progress.lessonPractices).toEqual(valid.lessonPractices)

    const invalid = { ...createInitialProgress(), lessonPractices: { 'basics-qa': { scenario: '', steps: 'Действие', expected: 'Результат', completedAt: '2026-11-10T10:00:00.000Z' } } }
    expect(saveProgress(invalid, memoryStorage())).toBe(true)
    expect(loadProgress(memoryStorage(JSON.stringify(invalid))).progress.lessonPractices).toEqual({})
  })

  it('migrates schema v7 and validates season reward records', () => {
    const storage = memoryStorage(JSON.stringify({
      ...createInitialProgress(),
      version: 7,
      seasonalResults: {
        '2026-11': {
          'arena-scenarios': { bestScore: 80, completedAt: '2026-11-10T10:00:00.000Z' },
          'marathon-sql': { bestScore: 75, completedAt: '2026-11-10T10:00:00.000Z' },
          'unsafe-id': { bestScore: 100, completedAt: '2026-11-10T10:00:00.000Z' },
        },
        invalid: { 'arena-scenarios': { bestScore: 100, completedAt: '2026-11-10T10:00:00.000Z' } },
      },
    }))
    const migrated = loadProgress(storage)
    expect(migrated.recovered).toBe(false)
    expect(migrated.progress.version).toBe(11)
    expect(migrated.progress.seasonalResults).toEqual({
      '2026-11': {
        'arena-scenarios': { bestScore: 80, completedAt: '2026-11-10T10:00:00.000Z' },
        'marathon-sql': { bestScore: 75, completedAt: '2026-11-10T10:00:00.000Z' },
      },
    })
  })

  it('preserves project answers and best scores when migrating schema v9', () => {
    const storage = memoryStorage(JSON.stringify({
      ...createInitialProgress(),
      version: 9,
      projectProgress: {
        'idor-security': {
          answers: { 'trust-boundary': 'server-owner', coverage: 'access-matrix', denial: 'deny-no-data', evidence: 'synthetic-proof' },
          bestScore: 100,
          completedAt: '2026-11-10T10:00:00.000Z',
        },
      },
    }))
    const migrated = loadProgress(storage)
    expect(migrated.recovered).toBe(false)
    expect(migrated.progress.version).toBe(11)
    expect(migrated.progress.projectProgress['idor-security']).toEqual({
      answers: { 'trust-boundary': 'server-owner', coverage: 'access-matrix', denial: 'deny-no-data', evidence: 'synthetic-proof' },
      bestScore: 100,
      completedAt: '2026-11-10T10:00:00.000Z',
      artifact: '',
    })
  })

  it('preserves editable project artifacts when migrating schema v10', () => {
    const artifact = 'Role | Operation | Expected\nOwner | GET | 200 own order\nOther user | PATCH | 403 with no data changes'
    const storage = memoryStorage(JSON.stringify({
      ...createInitialProgress(),
      version: 10,
      projectProgress: {
        'idor-security': { answers: {}, bestScore: 75, completedAt: '2026-11-10T10:00:00.000Z', artifact },
      },
    }))
    const migrated = loadProgress(storage)
    expect(migrated.recovered).toBe(false)
    expect(migrated.progress.version).toBe(11)
    expect(migrated.progress.projectProgress['idor-security'].artifact).toBe(artifact)
  })

  it('round-trips validated local daily challenge deliverables', () => {
    const progress = {
      ...createInitialProgress(),
      dailyCompletions: ['2026-11-10'],
      dailyChallenges: {
        '2026-11-10': {
          activityType: 'test-design',
          response: { cases: [
            { type: 'positive', condition: 'Use a valid record', expected: 'One record is saved' },
            { type: 'negative', condition: 'Use an empty required field', expected: 'The request is rejected' },
          ] },
          completedAt: '2026-11-10T10:00:00.000Z',
        },
      },
    }
    const storage = memoryStorage()
    expect(saveProgress(progress, storage)).toBe(true)
    expect(loadProgress(storage).progress.dailyChallenges).toEqual(progress.dailyChallenges)

    const malformed = { ...progress, dailyChallenges: { ...progress.dailyChallenges, '2026-11-11': { activityType: 'bug-report', response: {}, completedAt: '2026-11-11T10:00:00.000Z' } } }
    expect(loadProgress(memoryStorage(JSON.stringify(malformed))).progress.dailyChallenges).toEqual(progress.dailyChallenges)
  })

  it('keeps bounded, validated XP transactions during local storage round trips', () => {
    const storage = memoryStorage()
    const progress = {
      ...createInitialProgress(),
      xpTransactions: [{ id: 'attempt-1', source: 'answer', title: 'Проверка границ', amount: 10, createdAt: '2026-11-10T10:00:00.000Z' }],
    }
    expect(saveProgress(progress, storage)).toBe(true)
    expect(loadProgress(storage).progress.xpTransactions).toEqual(progress.xpTransactions)

    const malformed = { ...progress, xpTransactions: [{ ...progress.xpTransactions[0], amount: -100 }] }
    expect(loadProgress(memoryStorage(JSON.stringify(malformed))).progress.xpTransactions).toEqual([])
  })
})
