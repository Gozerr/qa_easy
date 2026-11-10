import { describe, expect, it } from 'vitest'
import { questions } from './questions.js'
import { getMarathonQuestions, marathonTracks } from './marathons.js'

describe('themed QA marathons', () => {
  it('offers a complete, non-empty question set for every learning category', () => {
    expect(marathonTracks.map(({ id }) => id)).toEqual(['fundamentals', 'web-api', 'scenarios'])
    for (const track of marathonTracks) {
      const pool = getMarathonQuestions(questions, track.id)
      expect(pool).toHaveLength(track.size)
      expect(pool.length).toBeGreaterThanOrEqual(5)
      expect(pool.every(({ category }) => category === track.id)).toBe(true)
    }
  })
})
