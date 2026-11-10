import { categories, questions } from './questions.js'

export const marathonTracks = categories.map(({ id, title, subtitle, icon, color }) => ({
  id,
  mode: `marathon-${id}`,
  title: `${title} · марафон`,
  categoryTitle: title,
  description: subtitle,
  icon,
  color,
  size: questions.filter((question) => question.category === id).length,
}))

export function getMarathonQuestions(pool, trackId) {
  return pool.filter((question) => question.category === trackId)
}
