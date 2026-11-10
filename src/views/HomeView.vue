<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, BookOpen, Bug, CalendarCheck, Check, ChevronRight, Database, Flame, MessageCircleQuestion, Play, Sparkles, Trophy, Zap } from '@lucide/vue'
import { useUtcDate } from '../composables/useUtcDate.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'
import { useProgress } from '../composables/useProgress.js'
import UserAvatar from '../components/UserAvatar.vue'
import MascotMark from '../components/MascotMark.vue'
import { theoryTopics } from '../data/theory.js'

const { progress, accuracy, currentStreak, cloudProfile } = useProgress()
const { questions, getDaily } = useQuestionBank()
const today = useUtcDate()
const dailyTask = computed(() => getDaily(today.value))
const dailyQuestion = computed(() => dailyTask.value.question)
const progressPercent = computed(() => Math.min(100, Math.round((progress.completedQuestionIds.length / questions.length) * 100)))
const lessonCount = computed(() => theoryTopics.reduce((sum, topic) => sum + topic.lessons.length, 0))
const dailyDone = computed(() => progress.dailyCompletions.includes(today.value))
const nextStep = computed(() => progress.answeredCount === 0
  ? { to: '/theory', label: 'Начать с основ', detail: '5 коротких тем для уверенного старта', icon: BookOpen }
  : { to: '/practice', label: 'Продолжить тренировку', detail: progressPercent.value < 100 ? `Открыто ${progress.completedQuestionIds.length} из ${questions.value.length} вопросов` : 'Ты прошёл весь базовый банк — закрепим навыки', icon: Play })
const level = computed(() => Math.max(1, Math.floor(progress.xp / 100) + 1))
const greeting = computed(() => {
  if (!cloudProfile.value?.firstName) return progress.answeredCount ? 'С возвращением!' : 'Привет, тестировщик!'
  return progress.answeredCount ? `С возвращением, ${cloudProfile.value.firstName}!` : `Привет, ${cloudProfile.value.firstName}!`
})
const greetingCopy = computed(() => progress.answeredCount
  ? 'Продолжим прокачивать QA-навыки?'
  : 'Начнём путь в QA с короткой практики.')
const todayLabel = computed(() => new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
}).format(new Date(`${today.value}T00:00:00Z`)).toLocaleUpperCase('ru-RU'))
const featureCards = computed(() => [
  { to: '/theory', title: 'Теория', subtitle: 'Короткие темы и практика', icon: BookOpen, tone: 'sky' },
  { to: '/practice', title: 'Найди багулю', subtitle: 'Разбирай реальные ситуации', icon: Bug, tone: 'coral' },
  { to: '/lab', title: 'QA Lab', subtitle: 'SQL и API на практике', icon: Database, tone: 'blue' },
  { to: '/interview', title: 'Собеседование', subtitle: 'Junior и Middle', icon: MessageCircleQuestion, tone: 'peach' },
  { to: '/daily', title: 'QA Daily', subtitle: dailyDone.value ? 'Задание выполнено' : 'Задание на 2 минуты', icon: CalendarCheck, tone: 'blue' },
  { to: '/leaderboard', title: 'Рейтинг', subtitle: 'Сравни результаты', icon: Trophy, tone: 'coral' },
  { to: '/arena', title: 'QA Arena', subtitle: 'Испытание сезона', icon: Trophy, tone: 'peach' },
  { to: '/marathons', title: 'QA-марафоны', subtitle: 'Три тематических испытания', icon: Zap, tone: 'coral' },
])
</script>

<template>
  <div class="page home-page">
    <header class="welcome-heading">
      <div>
        <p class="eyebrow">{{ todayLabel }}</p>
        <h1>{{ greeting }}</h1>
        <p>{{ greetingCopy }}</p>
      </div>
      <RouterLink to="/profile" aria-label="Открыть профиль">
        <UserAvatar :src="cloudProfile?.avatarUrl" :name="cloudProfile?.firstName || 'QA'" size="user-avatar-home" />
      </RouterLink>
    </header>

    <RouterLink :to="nextStep.to" class="next-step-card">
      <span class="next-step-orbit" aria-hidden="true"><component :is="nextStep.icon" :size="27" /></span>
      <span class="next-step-copy"><span class="eyebrow">СЛЕДУЮЩИЙ ШАГ · УРОВЕНЬ {{ level }}</span><strong>{{ nextStep.label }}</strong><small>{{ nextStep.detail }}</small></span>
      <span class="next-step-action">Вперёд <ArrowRight :size="17" aria-hidden="true" /></span>
    </RouterLink>

    <section class="dashboard-progress" aria-label="Твой прогресс">
      <div class="dashboard-progress-heading">
        <span class="dashboard-progress-icon"><Sparkles :size="17" aria-hidden="true" /></span>
        <span class="eyebrow">ТВОЙ ПРОГРЕСС</span>
        <RouterLink to="/profile" class="progress-detail-link">Подробнее <ChevronRight :size="15" aria-hidden="true" /></RouterLink>
      </div>
      <div class="dashboard-progress-values">
        <div><strong>{{ progress.xp }}</strong><span>XP опыта</span></div>
        <span class="progress-divider" aria-hidden="true"></span>
        <div><strong>{{ accuracy }}<small>%</small></strong><span>точность</span></div>
        <div class="dashboard-streak"><Flame :size="17" aria-hidden="true" /><strong>{{ currentStreak }}</strong><span>дней</span></div>
      </div>
      <div class="progress-track" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100" aria-label="Прогресс по вопросам">
        <span :style="{ width: `${progressPercent}%` }" />
      </div>
      <p class="dashboard-progress-foot">{{ progress.completedQuestionIds.length }} из {{ questions.length }} вопросов · {{ progress.completedLessonIds.length }} из {{ lessonCount }} уроков</p>
    </section>

    <RouterLink class="daily-hero" to="/daily">
      <div class="daily-hero-copy">
        <div class="daily-label"><CalendarCheck :size="15" aria-hidden="true" /> ЗАДАНИЕ ДНЯ <span>{{ dailyDone ? 'ГОТОВО' : '2 МИН' }}</span></div>
        <h2>{{ dailyTask.title }}</h2>
        <p>{{ dailyTask.prompt }}</p>
        <span class="daily-hero-link">{{ dailyDone ? 'Открыть разбор' : 'Начать задание' }} <ArrowRight :size="17" aria-hidden="true" /></span>
      </div>
      <span class="daily-hero-art"><MascotMark /></span>
      <span class="hero-date"><Check v-if="dailyDone" :size="14" aria-hidden="true" /> {{ today }} · UTC</span>
    </RouterLink>

    <div class="section-heading">
      <div><p class="eyebrow">ТРЕНАЖЁР</p><h2>Выбери режим</h2></div>
    </div>

    <div class="feature-grid">
      <RouterLink v-for="feature in featureCards" :key="feature.to" :to="feature.to" class="feature-card" :class="`feature-${feature.tone}`" :aria-label="feature.to === '/leaderboard' ? 'Таблица лидеров' : undefined">
        <span class="feature-card-icon"><component :is="feature.icon" :size="20" :stroke-width="1.8" aria-hidden="true" /></span>
        <span class="feature-card-copy"><strong>{{ feature.title }}</strong><small>{{ feature.subtitle }}</small></span>
        <ArrowRight :size="16" aria-hidden="true" />
      </RouterLink>
    </div>

    <p class="home-footnote" v-if="dailyQuestion">{{ dailyDone ? 'Отличная работа — короткие занятия помогают знаниям закрепиться.' : 'Несколько минут практики сегодня — ещё один уверенный шаг в QA.' }}</p>
  </div>
</template>
