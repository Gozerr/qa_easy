<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BookOpen, Check, ChevronDown, Clock3, Lightbulb, MessageCircleQuestion, Target } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import { theoryTopics } from '../data/theory.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'
import { useProgress } from '../composables/useProgress.js'

const route = useRoute()
const { getQuestion } = useQuestionBank()
const { progress, markLessonComplete } = useProgress()
const categories = ['Все модули', ...new Set(theoryTopics.map(({ category }) => category))]
const activeCategory = ref(categories.includes(route.query.category) ? route.query.category : 'Все модули')
const visibleTopics = computed(() => activeCategory.value === 'Все модули'
  ? theoryTopics
  : theoryTopics.filter(({ category }) => category === activeCategory.value))
const totalLessons = computed(() => theoryTopics.reduce((sum, topic) => sum + topic.lessons.length, 0))
const completedLessons = computed(() => progress.completedLessonIds.length)
const completionPercent = computed(() => totalLessons.value ? Math.round(completedLessons.value / totalLessons.value * 100) : 0)

watch(() => route.query.category, (category) => {
  activeCategory.value = categories.includes(category) ? category : 'Все модули'
})

function topicLessonCount(topic) {
  return topic.lessons.filter(({ id }) => progress.completedLessonIds.includes(id)).length
}

function lessonIsComplete(id) {
  return progress.completedLessonIds.includes(id)
}

function questionById(id) {
  return getQuestion(id)
}

const recallOpen = ref(false)
</script>

<template>
  <div class="page theory-page">
    <PageHeading eyebrow="КАРТА ОБУЧЕНИЯ · 10 МОДУЛЕЙ" title="Путь в QA" description="Выбирай тему в своём темпе. В каждом модуле — короткие уроки, рабочие примеры, частые ошибки и вопрос для самопроверки." />

    <section class="course-progress" aria-label="Прогресс обучения">
      <div class="course-progress-copy"><span class="course-progress-icon"><BookOpen :size="18" aria-hidden="true" /></span><div><strong>{{ completedLessons }} из {{ totalLessons }} уроков</strong><small>Отмечай уроки по мере изучения</small></div><strong class="course-progress-percent">{{ completionPercent }}%</strong></div>
      <div class="progress-track" role="progressbar" :aria-valuenow="completionPercent" aria-valuemin="0" aria-valuemax="100" aria-label="Прогресс по программе"><span :style="{ width: `${completionPercent}%` }" /></div>
      <p>Прогресс уроков сохраняется на этом устройстве. Контрольные ответы продолжают учитываться в общей статистике.</p>
    </section>

    <div class="filter-tabs" role="group" aria-label="Фильтр учебных модулей">
      <button v-for="category in categories" :key="category" type="button" :aria-pressed="activeCategory === category" :class="{ 'is-active': activeCategory === category }" @click="activeCategory = category">
        {{ category }}
      </button>
    </div>

    <div class="theory-list">
      <details v-for="(topic, index) in visibleTopics" :key="topic.id" class="theory-topic course-module" :open="index === 0">
        <summary>
          <span class="theory-number">{{ String(theoryTopics.indexOf(topic) + 1).padStart(2, '0') }}</span>
          <span class="theory-summary-copy"><span class="eyebrow">{{ topic.category }}</span><strong>{{ topic.title }}</strong><small>{{ topic.summary }}</small><span class="module-progress-line"><span :style="{ width: `${topicLessonCount(topic) / topic.lessons.length * 100}%` }" /></span></span>
          <span class="theory-meta"><Clock3 :size="14" aria-hidden="true" /> {{ topic.time }} <ChevronDown :size="17" aria-hidden="true" /></span>
        </summary>
        <div class="theory-body">
          <p class="module-lesson-count">{{ topicLessonCount(topic) }} из {{ topic.lessons.length }} уроков отмечено</p>
          <article v-for="(lesson, lessonIndex) in topic.lessons" :key="lesson.id" class="lesson-block">
            <div class="lesson-title-row"><span class="lesson-index">{{ String(lessonIndex + 1).padStart(2, '0') }}</span><h3>{{ lesson.heading }}</h3></div>
            <p>{{ lesson.text }}</p>
            <div class="lesson-example"><strong><Lightbulb :size="14" aria-hidden="true" /> На практике</strong><p>{{ lesson.example }}</p></div>
            <p class="lesson-pitfall"><strong>Частая ошибка:</strong> {{ lesson.pitfall }}</p>
            <p class="lesson-interview"><strong><MessageCircleQuestion :size="14" aria-hidden="true" /> На собеседовании:</strong> {{ lesson.interview }}</p>
            <button class="lesson-complete" type="button" :aria-pressed="lessonIsComplete(lesson.id)" @click="markLessonComplete(lesson.id)">
              <Check v-if="lessonIsComplete(lesson.id)" :size="16" aria-hidden="true" />
              <span>{{ lessonIsComplete(lesson.id) ? 'Урок изучен' : 'Отметить как изученный' }}</span>
            </button>
          </article>

          <div v-if="topic.activeRecall" class="active-recall">
            <div class="knowledge-label"><Target :size="16" aria-hidden="true" /> ВСПОМНИ САМОСТОЯТЕЛЬНО</div>
            <p>{{ topic.activeRecall.prompt }}</p>
            <button class="button button-quiet" type="button" :aria-expanded="recallOpen" @click="recallOpen = !recallOpen">{{ recallOpen ? 'Скрыть разбор' : 'Показать разбор' }}</button>
            <p v-if="recallOpen" class="active-recall-answer" role="status">{{ topic.activeRecall.answer }}</p>
          </div>

          <div v-if="topic.checkQuestionId" class="knowledge-check">
            <div class="knowledge-label"><BookOpen :size="16" aria-hidden="true" /> ПРОВЕРЬ СЕБЯ · БЕЗ ШТРАФА ЗА ОШИБКУ</div>
            <QuizPlayer :mode="`theory-${topic.id}`" :pool="[questionById(topic.checkQuestionId)].filter(Boolean)" :size="1" start-label="Ответить на вопрос" />
          </div>
        </div>
      </details>
    </div>
  </div>
</template>
