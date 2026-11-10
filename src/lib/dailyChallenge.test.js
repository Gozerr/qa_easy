import { describe, expect, it } from 'vitest'
import { validateDailyChallenge } from './dailyChallenge.js'

describe('QA Daily challenge rubrics', () => {
  it('accepts two complete test cases from different coverage classes', () => {
    const response = { cases: [
      { type: 'positive', condition: 'Enter a valid active user', expected: 'One session is created' },
      { type: 'negative', condition: 'Send an empty user ID', expected: 'Request is rejected without a state change' },
    ] }
    expect(validateDailyChallenge('test-design', response)).toEqual(response)
    expect(validateDailyChallenge('test-design', { cases: [response.cases[0], { ...response.cases[1], type: 'positive' }] })).toBeNull()
  })

  it('requires a reproducible and distinguishable bug report', () => {
    const response = {
      title: 'Orders API exposes a different owner address',
      environment: 'Android 15, QA build 42',
      preconditions: 'Two synthetic user accounts and one order exist',
      steps: 'Sign in as user A\nRequest user B order by ID',
      actual: 'Private address is included in the API response',
      expected: 'API denies access without returning private order fields',
      severity: 'Высокая',
      priority: 'Высокий',
    }
    expect(validateDailyChallenge('bug-report', response)).toEqual(response)
    expect(validateDailyChallenge('bug-report', { ...response, expected: response.actual })).toBeNull()
    expect(validateDailyChallenge('question', response)).toBeNull()
  })
})
