import { describe, expect, it } from 'vitest'
import { evaluateProjectArtifact, qaProjects, scoreProject } from './qaProjects.js'

describe('cross-functional QA projects', () => {
  it('contains the requested API security, integration and automation case studies', () => {
    expect(qaProjects.map(({ id }) => id)).toEqual(['idor-security', 'payment-webhook', 'ci-quality-gate'])
    for (const project of qaProjects) {
      expect(project.tasks).toHaveLength(4)
      expect(new Set(project.tasks.map(({ id }) => id)).size).toBe(project.tasks.length)
      for (const task of project.tasks) {
        expect(task.options.filter(({ correct }) => correct)).toHaveLength(1)
        expect(new Set(task.options.map(({ id }) => id)).size).toBe(task.options.length)
      }
    }
  })

  it('scores only a complete set of known choices and computes the result', () => {
    const project = qaProjects[0]
    const answer = Object.fromEntries(project.tasks.map((task) => [task.id, task.options.find(({ correct }) => correct).id]))
    expect(scoreProject(project, {})).toEqual({ score: 0, correct: 0, total: 4, complete: false })
    expect(scoreProject(project, answer)).toEqual({ score: 100, correct: 4, total: 4, complete: true })
    expect(scoreProject(project, { ...answer, [project.tasks[0].id]: 'unknown' })).toEqual({ score: 75, correct: 3, total: 4, complete: false })
  })

  it('checks project artifacts against role-specific, integration and automation criteria', () => {
    for (const project of qaProjects) {
      const evaluation = evaluateProjectArtifact(project, project.artifact.placeholder)
      expect(evaluation.length).toBeGreaterThanOrEqual(3)
      expect(evaluation.every(({ passed }) => passed), project.id).toBe(true)
      expect(evaluateProjectArtifact(project, 'A short note')).toContainEqual(expect.objectContaining({ passed: false }))
    }
  })
})
