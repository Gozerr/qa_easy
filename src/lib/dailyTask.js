const DAY_IN_MS = 24 * 60 * 60 * 1000

export function utcDateKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10)
}

export function getDailyTask(date, tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null

  const dateKey = typeof date === 'string' ? date : utcDateKey(date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new TypeError('Дата должна быть в формате ГГГГ-ММ-ДД')

  const timestamp = Date.parse(`${dateKey}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== dateKey) {
    throw new TypeError('Указана некорректная календарная дата')
  }

  const dayNumber = Math.floor(timestamp / DAY_IN_MS)
  const taskIndex = ((dayNumber % tasks.length) + tasks.length) % tasks.length
  return tasks[taskIndex]
}