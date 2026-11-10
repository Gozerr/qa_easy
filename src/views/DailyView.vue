<script setup>
import { computed } from 'vue'
import { CalendarCheck, Check, Clock3, Globe2 } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import WeeklyMissionsPanel from '../components/WeeklyMissionsPanel.vue'
import { useUtcDate } from '../composables/useUtcDate.js'
import { useProgress } from '../composables/useProgress.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'

const date = useUtcDate()
const { getDaily } = useQuestionBank()
const task = computed(() => getDaily(date.value))
const question = computed(() => task.value.question)
const { progress } = useProgress()
const done = computed(() => progress.dailyCompletions.includes(date.value))
const dateLabel = computed(() => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date.value}T00:00:00Z`)))
</script>

<template>
  <div class="page">
    <PageHeading eyebrow="ОДНА ЗАДАЧА · КАЖДЫЙ ДЕНЬ" title="QA Daily" description="Короткая практика, чтобы QA-мышца не засыпала." />

    <section class="daily-detail">
      <div class="daily-detail-top">
        <span class="daily-detail-icon"><CalendarCheck :size="20" aria-hidden="true" /></span>
        <span class="daily-state" :class="{ 'is-done': done }">
          <Check v-if="done" :size="14" aria-hidden="true" /> {{ done ? 'ЗАДАНИЕ ВЫПОЛНЕНО' : 'ЗАДАНИЕ ДНЯ' }}
        </span>
      </div>
      <p class="eyebrow">{{ dateLabel }} · UTC</p>
      <h2>{{ task.title }}</h2>
      <p class="daily-prompt">{{ task.prompt }}</p>
      <div class="daily-detail-meta"><span><Clock3 :size="15" aria-hidden="true" /> 2 минуты</span><span><Globe2 :size="15" aria-hidden="true" /> Одинаково для всех</span></div>
    </section>

    <p class="daily-expectation">Сначала выбери вариант, затем открой разбор. Задание меняется в 00:00 UTC.</p>
    <QuizPlayer :mode="`daily-${date}`" :pool="[question]" :size="1" :daily-date="date" start-label="Взяться за задачу" />
    <WeeklyMissionsPanel :today="date" />
  </div>
</template>
