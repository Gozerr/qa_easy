import { computed } from 'vue'
import { questions as localQuestions } from '../data/questions.js'
import { dailyTasks as localDailyTasks } from '../data/dailyTasks.js'
import { cloudDailyTask, cloudQuestions, cloudStatus } from '../lib/cloudApi.js'
import { getDailyTask } from '../lib/dailyTask.js'

export function useQuestionBank() {
  const questions = computed(() => cloudStatus.value === 'ready' && cloudQuestions.value.length
    ? cloudQuestions.value
    : localQuestions)

  function getQuestion(questionId) {
    return questions.value.find(({ id }) => id === questionId) ?? null
  }

  function getDaily(date) {
    const remote = cloudDailyTask.value
    if (cloudStatus.value === 'ready' && remote?.date === date && remote.content?.questionId) {
      const question = getQuestion(remote.content.questionId)
      if (question) return { id: remote.id, title: remote.title, prompt: remote.description, questionId: question.id, question }
    }
    const task = getDailyTask(date, localDailyTasks)
    return { ...task, question: getQuestion(task.questionId) }
  }

  return { questions, getQuestion, getDaily }
}