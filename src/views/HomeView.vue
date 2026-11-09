<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, Award, BookOpen, Bug, CalendarCheck, Check, ChevronRight, Flame, MessageCircleQuestion, Sparkles } from '@lucide/vue'
import { useUtcDate } from '../composables/useUtcDate.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'
import { useProgress } from '../composables/useProgress.js'

const { progress, accuracy, currentStreak } = useProgress()
const { questions, getDaily } = useQuestionBank()
const today = useUtcDate()
const dailyTask = computed(() => getDaily(today.value))
const dailyQuestion = computed(() => dailyTask.value.question)
const progressPercent = computed(() => Math.min(100, Math.round((progress.completedQuestionIds.length / questions.length) * 100)))
const dailyDone = computed(() => progress.dailyCompletions.includes(today.value))
const todayLabel = computed(() => new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
}).format(new Date(`${today.value}T00:00:00Z`)).toLocaleUpperCase('ru-RU'))
const featureCards = computed(() => [
  { to: '/theory', title: 'Теория', subtitle: '5 коротких тем', icon: BookOpen, tone: 'lavender' },
  { to: '/practice', title: 'Найди багулю', subtitle: '10 ситуаций', icon: Bug, tone: 'mint' },
  { to: '/interview', title: 'Собеседование', subtitle: 'Junior и Middle', icon: MessageCircleQuestion, tone: 'peach' },
  { to: '/profile', title: 'Мой прогресс', subtitle: `${progress.xp} XP · ${accuracy}% точность`, icon: Award, tone: 'blue' },
])
</script>

<template>
  <div class="page home-page">
    <header class="welcome-heading">
      <div>
        <p class="eyebrow">{{ todayLabel }}</p>
        <h1>Привет, тестировщик!</h1>
        <p>Проверим пару гипотез?</p>
      </div>
      <span class="welcome-mark"><Sparkles :size="21" aria-hidden="true" /></span>
    </header>

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
      <p class="dashboard-progress-foot">{{ progress.completedQuestionIds.length }} из {{ questions.length }} вопросов освоено</p>
    </section>

    <RouterLink class="daily-hero" to="/daily">
      <div class="daily-hero-copy">
        <div class="daily-label"><CalendarCheck :size="15" aria-hidden="true" /> ЗАДАНИЕ ДНЯ <span>{{ dailyDone ? 'ГОТОВО' : '2 МИН' }}</span></div>
        <h2>{{ dailyTask.title }}</h2>
        <p>{{ dailyTask.prompt }}</p>
        <span class="daily-hero-link">{{ dailyDone ? 'Открыть разбор' : 'Начать задание' }} <ArrowRight :size="17" aria-hidden="true" /></span>
      </div>
      <span class="daily-hero-art" aria-hidden="true"><CalendarCheck :size="27" /></span>
      <span class="hero-date"><Check v-if="dailyDone" :size="14" aria-hidden="true" /> {{ today }} · UTC</span>
    </RouterLink>

    <div class="section-heading">
      <div><p class="eyebrow">ВЫБЕРИ МАРШРУТ</p><h2>Продолжим?</h2></div>
    </div>

    <div class="feature-grid">
      <RouterLink v-for="feature in featureCards" :key="feature.to" :to="feature.to" class="feature-card" :class="`feature-${feature.tone}`">
        <span class="feature-card-icon"><component :is="feature.icon" :size="20" :stroke-width="1.8" aria-hidden="true" /></span>
        <span class="feature-card-copy"><strong>{{ feature.title }}</strong><small>{{ feature.subtitle }}</small></span>
        <ArrowRight :size="16" aria-hidden="true" />
      </RouterLink>
    </div>

    <p class="home-footnote">{{ dailyQuestion.question }}</p>
  </div>
</template>