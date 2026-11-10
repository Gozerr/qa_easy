const TEST_TYPES = new Set(['positive', 'negative', 'boundary', 'validation'])
const SEVERITIES = new Set(['Критическая', 'Высокая', 'Средняя', 'Низкая'])
const PRIORITIES = new Set(['Немедленно', 'Высокий', 'Обычный', 'Низкий'])

function cleanText(value, maxLength) {
  return typeof value === 'string' && value.trim().length <= maxLength ? value.trim() : ''
}

export function validateDailyChallenge(activityType, response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null

  if (activityType === 'test-design') {
    if (!Array.isArray(response.cases) || response.cases.length < 2 || response.cases.length > 4) return null
    const cases = response.cases.map((item) => ({
      type: item?.type,
      condition: cleanText(item?.condition, 300),
      expected: cleanText(item?.expected, 300),
    }))
    if (cases.some((item) => !TEST_TYPES.has(item.type) || item.condition.length < 5 || item.expected.length < 5)) return null
    if (new Set(cases.map(({ type }) => type)).size < 2) return null
    return { cases }
  }

  if (activityType === 'bug-report') {
    const clean = {
      title: cleanText(response.title, 160),
      environment: cleanText(response.environment, 160),
      preconditions: cleanText(response.preconditions, 300),
      steps: cleanText(response.steps, 700),
      actual: cleanText(response.actual, 300),
      expected: cleanText(response.expected, 300),
      severity: response.severity,
      priority: response.priority,
    }
    const stepCount = clean.steps.split(/\r?\n/).filter((line) => line.trim()).length
    if (clean.title.length < 12 || clean.environment.length < 5 || clean.preconditions.length < 5 || stepCount < 2
      || clean.actual.length < 8 || clean.expected.length < 8 || clean.expected === clean.actual
      || !SEVERITIES.has(clean.severity) || !PRIORITIES.has(clean.priority)) return null
    return clean
  }

  return null
}
