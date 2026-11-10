<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BookOpen, Check, ChevronDown, Clock3, Lightbulb, MessageCircleQuestion, Target, UsersRound } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import { theoryTopics } from '../data/theory.js'
import { categoryLabels } from '../data/questions.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'
import { useProgress } from '../composables/useProgress.js'

const route = useRoute()
const { getQuestion } = useQuestionBank()
const { progress, cloudStatus, getSkillComparison, markLessonComplete, recordLessonPractice } = useProgress()
const categories = ['Все модули', ...new Set(theoryTopics.map(({ category }) => category))]
const activeCategory = ref(categories.includes(route.query.category) ? route.query.category : 'Все модули')
const visibleTopics = computed(() => activeCategory.value === 'Все модули'
  ? theoryTopics
  : theoryTopics.filter(({ category }) => category === activeCategory.value))
const totalLessons = computed(() => theoryTopics.reduce((sum, topic) => sum + topic.lessons.length, 0))
const completedLessons = computed(() => progress.completedLessonIds.length)
const lessonDrafts = reactive(Object.fromEntries(theoryTopics.flatMap(({ lessons }) => lessons.map(({ id }) => {
  const saved = progress.lessonPractices[id]
  return [id, { scenario: saved?.scenario ?? '', steps: saved?.steps ?? '', expected: saved?.expected ?? '' }]
}))))
const completionPercent = computed(() => totalLessons.value ? Math.round(completedLessons.value / totalLessons.value * 100) : 0)
const skillModules = computed(() => theoryTopics.map((topic, index) => {
  const completed = topicLessonCount(topic)
  const percent = Math.round(completed / topic.lessons.length * 100)
  const level = ['Основы', 'Документация', 'Тест-дизайн', 'Виды проверок'].includes(topic.category) ? 'Junior' : index < 7 ? 'Junior → Middle' : 'Middle'
  return { ...topic, index, completed, percent, level }
}))
const skillComparison = ref(null)
const skillComparisonLoading = ref(false)
const skillComparisonError = ref('')
let comparisonRequest = 0

async function loadSkillComparison() {
  const request = ++comparisonRequest
  skillComparisonError.value = ''
  if (cloudStatus.value !== 'ready') {
    skillComparison.value = null
    return
  }
  skillComparisonLoading.value = true
  try {
    skillComparison.value = await getSkillComparison()
  } catch {
    if (request === comparisonRequest) skillComparisonError.value = 'Не удалось загрузить сравнение навыков.'
  } finally {
    if (request === comparisonRequest) skillComparisonLoading.value = false
  }
}

watch(() => route.query.category, (category) => {
  activeCategory.value = categories.includes(category) ? category : 'Все модули'
})
watch(cloudStatus, () => { void loadSkillComparison() }, { immediate: true })

function topicLessonCount(topic) {
  return topic.lessons.filter(({ id }) => progress.completedLessonIds.includes(id)).length
}

function lessonIsComplete(id) {
  return progress.completedLessonIds.includes(id)
}

function saveLessonPractice(id) {
  recordLessonPractice(id, lessonDrafts[id])
}

function questionById(id) {
  return getQuestion(id)
}

async function openModule(id) {
  activeCategory.value = 'Все модули'
  await nextTick()
  const element = document.getElementById(id)
  if (!element) return
  element.open = true
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

    <section class="skill-map" aria-labelledby="skill-map-title">
      <div class="skill-map-heading"><div><p class="eyebrow">КАРТА НАВЫКОВ</p><h2 id="skill-map-title">Путь от Junior к Middle</h2></div><span>{{ completedLessons }}/{{ totalLessons }}</span></div>
      <div class="skill-map-grid">
        <a v-for="module in skillModules" :key="module.id" class="skill-node" :href="`#${module.id}`" :aria-label="`${module.title}: ${module.percent}%, уровень ${module.level}`" @click.prevent="openModule(module.id)">
          <span class="skill-node-number">{{ String(module.index + 1).padStart(2, '0') }}</span>
          <span class="skill-node-copy"><strong>{{ module.title }}</strong><small>{{ module.level }}</small></span>
          <span class="skill-node-percent">{{ module.percent }}%</span>
          <span class="skill-node-track"><span :style="{ width: `${module.percent}%` }" /></span>
        </a>
      </div>
    </section>

    <section class="skill-comparison" aria-labelledby="skill-comparison-title">
      <div class="skill-comparison-heading"><span><UsersRound :size="17" aria-hidden="true" /></span><div><p class="eyebrow">ОБЩИЙ СЕЗОН · ПУБЛИЧНЫЙ РЕЙТИНГ</p><h2 id="skill-comparison-title">Сравнение навыков</h2></div></div>
      <p v-if="cloudStatus !== 'ready'" class="skill-comparison-note">Сравнение доступно в подтверждённой сессии Telegram. В общую статистику входят только участники, включившие публичный рейтинг.</p>
      <p v-else-if="skillComparisonLoading && !skillComparison" class="skill-comparison-note" role="status">Загружаем сравнение…</p>
      <p v-else-if="skillComparisonError" class="skill-comparison-error" role="alert">{{ skillComparisonError }}</p>
      <div v-else-if="skillComparison" class="skill-comparison-list">
        <article v-for="skill in skillComparison.categories" :key="skill.id" class="skill-comparison-row">
          <div class="skill-comparison-label"><strong>{{ categoryLabels[skill.id] }}</strong><span>{{ skill.personalAttempts }} твоих ответов</span></div>
          <div class="skill-comparison-values">
            <span>Ты <strong>{{ skill.personalAccuracy === null ? 'пока нет данных' : `${skill.personalAccuracy}%` }}</strong></span>
            <span>Среднее <strong>{{ skill.communityAverage === null ? `скрыто · ${skill.communityParticipants}/5` : `${skill.communityAverage}%` }}</strong></span>
          </div>
          <div class="skill-comparison-bars" aria-hidden="true">
            <span class="skill-comparison-personal"><i :style="{ width: `${skill.personalAccuracy ?? 0}%` }" /></span>
            <span class="skill-comparison-community"><i :style="{ width: `${skill.communityAverage ?? 0}%` }" /></span>
          </div>
        </article>
      </div>
      <p class="skill-comparison-footnote">Среднее показывается только при пяти и более участниках по теме. Имена и индивидуальные ответы других пользователей не передаются.</p>
    </section>

    <div class="filter-tabs" role="group" aria-label="Фильтр учебных модулей">
      <button v-for="category in categories" :key="category" type="button" :aria-pressed="activeCategory === category" :class="{ 'is-active': activeCategory === category }" @click="activeCategory = category">
        {{ category }}
      </button>
    </div>

    <div class="theory-list">
      <details v-for="(topic, index) in visibleTopics" :id="topic.id" :key="topic.id" class="theory-topic course-module" :open="index === 0">
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
            <form class="lesson-practice" @submit.prevent="saveLessonPractice(lesson.id)">
              <div class="knowledge-label"><Target :size="15" aria-hidden="true" /> ПРАКТИКА ПО УРОКУ</div>
              <p>На основе примера выше придумай проверку для этой темы. Запиши риск или условие, действия и результат, который можно наблюдать.</p>
              <label :for="`practice-scenario-${lesson.id}`">Что проверяешь</label>
              <textarea :id="`practice-scenario-${lesson.id}`" v-model="lessonDrafts[lesson.id].scenario" maxlength="1500" rows="2" required placeholder="Например: повторно отправить запрос после тайм-аута" />
              <label :for="`practice-steps-${lesson.id}`">Шаги или тестовые данные</label>
              <textarea :id="`practice-steps-${lesson.id}`" v-model="lessonDrafts[lesson.id].steps" maxlength="1500" rows="2" required placeholder="Опиши конкретные действия и условия" />
              <label :for="`practice-expected-${lesson.id}`">Ожидаемый наблюдаемый результат</label>
              <textarea :id="`practice-expected-${lesson.id}`" v-model="lessonDrafts[lesson.id].expected" maxlength="1500" rows="2" required placeholder="Что должно произойти и что именно ты проверишь" />
              <div class="lesson-practice-actions"><button class="button button-primary" type="submit"><Check :size="15" aria-hidden="true" /> {{ progress.lessonPractices[lesson.id] ? 'Обновить ответ' : 'Сохранить практику' }}</button><span v-if="progress.lessonPractices[lesson.id]" role="status">Практика сохранена · урок отмечен изученным</span></div>
              <div v-if="progress.lessonPractices[lesson.id]" class="lesson-practice-review"><strong>Сверь решение с материалом</strong><p><b>Пример из урока:</b> {{ lesson.example }}</p><p><b>Риск, который важно учесть:</b> {{ lesson.pitfall }}</p></div>
            </form>
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
