<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowRight, Check, CircleHelp, RotateCcw, Sparkles, X } from '@lucide/vue'
import { getSessionQuestion, validateAnswer } from '../lib/quizEngine.js'
import { useProgress } from '../composables/useProgress.js'

const props = defineProps({
  mode: { type: String, required: true },
  pool: { type: Array, required: true },
  size: { type: Number, default: 10 },
  dailyDate: { type: String, default: null },
  startLabel: { type: String, default: 'Начать тренировку' },
})

const { progress, cloudStatus, beginSession, submitSessionAnswer, retryPendingAttempt, advanceSession } = useProgress()
const selectedOptionId = ref('')
const hintOpen = ref(false)
const submissionError = ref('')
const submitting = ref(false)
const nextClickLocked = ref(false)
const session = computed(() => {
  const saved = progress.activeSessions[props.mode] ?? null
  if (cloudStatus.value === 'ready' && saved && !saved.serverVerified) return null
  return saved
})
const question = computed(() => session.value && !session.value.completed
  ? getSessionQuestion(props.pool, session.value)
  : null)
const existingAnswer = computed(() => session.value?.answers.find(({ questionId }) => questionId === question.value?.id) ?? null)
const score = computed(() => session.value?.answers.filter(({ correct }) => correct).length ?? 0)
const completionPercent = computed(() => session.value
  ? Math.round((session.value.currentIndex / session.value.questionIds.length) * 100)
  : 0)

watch(() => props.mode, () => {
  selectedOptionId.value = ''
  hintOpen.value = false
  submissionError.value = ''
})

async function start() {
  selectedOptionId.value = ''
  hintOpen.value = false
  submissionError.value = ''
  submitting.value = true
  try {
    await beginSession(props.mode, props.pool, props.size, props.dailyDate)
  } catch {
    submissionError.value = 'Не удалось подготовить тренировку. Проверьте соединение и повторите попытку.'
  } finally {
    submitting.value = false
  }
}

async function submit() {
  if (!question.value || !selectedOptionId.value || existingAnswer.value || submitting.value) return
  submitting.value = true
  submissionError.value = ''
  try {
    const result = await submitSessionAnswer(props.mode, question.value, selectedOptionId.value, props.dailyDate)
    if (result?.pending) submissionError.value = result.error
  } finally {
    submitting.value = false
  }
}

async function retrySubmit() {
  if (!question.value || submitting.value) return
  submitting.value = true
  submissionError.value = ''
  try {
    const result = await retryPendingAttempt(props.mode, question.value)
    if (result?.pending) submissionError.value = result.error
  } finally {
    submitting.value = false
  }
}

function next() {
  if (nextClickLocked.value) return
  nextClickLocked.value = true
  advanceSession(props.mode, props.dailyDate)
  selectedOptionId.value = ''
  hintOpen.value = false
  window.setTimeout(() => { nextClickLocked.value = false }, 250)
}

function optionState(optionId) {
  if (!existingAnswer.value) return ''
  if (optionId === (existingAnswer.value.correctOptionId || question.value.correctOptionId)) return 'is-correct'
  if (optionId === existingAnswer.value.selectedOptionId) return 'is-wrong'
  return ''
}
</script>

<template>
  <section class="quiz-panel">
    <div v-if="pool.length === 0" class="empty-state">
      <CircleHelp :size="28" aria-hidden="true" />
      <h2>Пока нет вопросов</h2>
      <p>Для этой тренировки ещё не добавлены задания.</p>
    </div>

    <div v-else-if="!session" class="quiz-intro">
      <span class="quiz-intro-icon"><Sparkles :size="22" aria-hidden="true" /></span>
      <div>
        <p class="eyebrow">ПРАКТИКА</p>
        <h2>Готовы проверить себя?</h2>
        <p>Вопросы и варианты ответов перемешаются. В конце разберём результат.</p>
      </div>
      <button class="button button-primary" type="button" :disabled="submitting" @click="start">
        {{ submitting ? 'Готовим вопросы…' : startLabel }} <ArrowRight :size="17" aria-hidden="true" />
      </button>
      <p v-if="submissionError" class="start-error" role="alert">{{ submissionError }}</p>
    </div>

    <div v-else-if="session.completed" class="result-state">
      <div class="result-mark" :class="{ 'result-mark-high': score >= Math.ceil(session.questionIds.length * 0.7) }">
        <Check v-if="score >= Math.ceil(session.questionIds.length * 0.7)" :size="30" aria-hidden="true" />
        <Sparkles v-else :size="28" aria-hidden="true" />
      </div>
      <p class="eyebrow">ТРЕНИРОВКА ЗАВЕРШЕНА</p>
      <h2>{{ score }} из {{ session.questionIds.length }} верно</h2>
      <p class="result-copy">
        {{ score === session.questionIds.length ? 'Без ошибок. Отличная работа!' : 'Разбор ответов уже сохранён в профиле. Можно закрепить тему ещё раз.' }}
      </p>
      <button class="button button-primary" type="button" @click="start">
        <RotateCcw :size="16" aria-hidden="true" /> Пройти заново
      </button>
    </div>

    <template v-else-if="question">
      <div class="quiz-meta">
        <span>{{ question.category === 'scenarios' ? 'ПРАКТИЧЕСКИЙ СЦЕНАРИЙ' : 'ВОПРОС' }}</span>
        <span>{{ session.currentIndex + 1 }} / {{ session.questionIds.length }}</span>
      </div>
      <div
        class="progress-track quiz-progress"
        role="progressbar"
        :aria-valuenow="session.currentIndex + (existingAnswer ? 1 : 0)"
        :aria-valuemin="0"
        :aria-valuemax="session.questionIds.length"
        aria-label="Ход тренировки"
      >
        <span :style="{ width: `${existingAnswer ? Math.max(completionPercent, 100 / session.questionIds.length) : completionPercent}%` }" />
      </div>

      <div class="question-heading">
        <span class="difficulty-tag">{{ question.difficulty }}</span>
        <h2>{{ question.question }}</h2>
      </div>

      <div class="option-list" role="group" aria-label="Варианты ответа">
        <button
          v-for="(option, index) in question.options"
          :key="option.id"
          class="answer-option"
          :class="[
            { 'is-selected': selectedOptionId === option.id && !existingAnswer },
            optionState(option.id),
          ]"
          type="button"
          :disabled="Boolean(existingAnswer) || submitting"
          :aria-pressed="selectedOptionId === option.id || existingAnswer?.selectedOptionId === option.id"
          @click="selectedOptionId = option.id"
        >
          <span class="option-marker">
            <Check v-if="optionState(option.id) === 'is-correct'" :size="15" aria-hidden="true" />
            <X v-else-if="optionState(option.id) === 'is-wrong'" :size="15" aria-hidden="true" />
            <template v-else>{{ String.fromCharCode(65 + index) }}</template>
          </span>
          <span>{{ option.text }}</span>
        </button>
      </div>

      <details v-if="question.hint && !existingAnswer" class="hint-box" :open="hintOpen" @toggle="hintOpen = $event.target.open">
        <summary><CircleHelp :size="16" aria-hidden="true" /> Нужна подсказка?</summary>
        <p>{{ question.hint }}</p>
      </details>

      <div v-if="existingAnswer" class="feedback-box" :class="existingAnswer.correct ? 'feedback-correct' : 'feedback-wrong'" role="status" aria-live="polite">
        <p class="feedback-title">
          <Check v-if="existingAnswer.correct" :size="17" aria-hidden="true" />
          <X v-else :size="17" aria-hidden="true" />
          {{ existingAnswer.correct ? 'Верно!' : 'Есть над чем подумать' }}
        </p>
        <p>{{ existingAnswer.explanation || question.explanation }}</p>
        <p v-if="!existingAnswer.correct" class="correct-answer">
          Верный вариант: {{ question.options.find(({ id }) => id === (existingAnswer.correctOptionId || question.correctOptionId))?.text }}
        </p>
      </div>

      <div v-if="submissionError" class="feedback-box feedback-wrong" role="alert">
        <p class="feedback-title"><X :size="17" aria-hidden="true" /> Не удалось сохранить ответ</p>
        <p>{{ submissionError }}</p>
        <button class="button button-quiet quiz-action" type="button" :disabled="submitting" @click="retrySubmit">
          {{ submitting ? 'Отправляем…' : 'Повторить отправку' }}
        </button>
      </div>

      <button
        v-if="!existingAnswer"
        class="button button-primary quiz-action"
        type="button"
        :disabled="!selectedOptionId || submitting"
        @click="submit"
      >
        {{ submitting ? 'Отправляем…' : 'Проверить ответ' }} <Check v-if="!submitting" :size="17" aria-hidden="true" />
      </button>
      <button v-else class="button button-primary quiz-action" type="button" :disabled="nextClickLocked" @click="next">
        {{ session.currentIndex === session.questionIds.length - 1 ? 'К результатам' : 'Следующий вопрос' }}
        <ArrowRight :size="17" aria-hidden="true" />
      </button>
    </template>
  </section>
</template>
