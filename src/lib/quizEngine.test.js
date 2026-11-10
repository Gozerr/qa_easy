import { describe, expect, it } from 'vitest'
import { createSession, shuffle, validateAnswer } from './quizEngine.js'
import { getDailyTask } from './dailyTask.js'
import { createInitialProgress, loadProgress, saveProgress, STORAGE_KEY } from './progressStorage.js'
import { categories, questions } from '../data/questions.js'
import { dailyTasks } from '../data/dailyTasks.js'

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
    expect(dailyTasks.every(({ title, prompt, questionId }) => title && prompt && questions.some(({ id }) => id === questionId))).toBe(true)
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
    expect(migrated.progress.version).toBe(4)
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
      version: 3,
      xp: 150,
      completedLessonIds: ['basics-qa', 'sql-model'],
    }))

    const migrated = loadProgress(storage)
    expect(migrated.recovered).toBe(false)
    expect(migrated.progress.version).toBe(4)
    expect(migrated.progress.xp).toBe(150)
    expect(migrated.progress.completedLessonIds).toEqual(['basics-qa', 'sql-model'])
    expect(migrated.progress.achievementDates).toEqual({})
  })
})
