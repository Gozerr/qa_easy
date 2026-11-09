<script setup>
import { computed, ref } from 'vue'
import { BriefcaseBusiness, CheckCircle2 } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import { useProgress } from '../composables/useProgress.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'

const level = ref('junior')
const { progress } = useProgress()
const { questions } = useQuestionBank()
const pool = computed(() => questions.value.filter(({ interviewLevel }) => level.value === 'junior'
  ? interviewLevel === 'junior'
  : interviewLevel === 'middle'))
const completed = computed(() => progress.activeSessions[`interview-${level.value}`]?.answers.length ?? 0)
</script>

<template>
  <div class="page">
    <PageHeading eyebrow="ТРЕНАЖЁР · 2 УРОВНЯ" title="Спокойно, это просто вопросы" description="Потренируйся объяснять ход мысли. После каждого ответа будет разбор, а не оценка кандидата." />

    <div class="level-switch" role="group" aria-label="Уровень собеседования">
      <button type="button" :aria-pressed="level === 'junior'" :class="{ 'is-active': level === 'junior' }" @click="level = 'junior'">
        <span>Junior</span><small>Базовые понятия</small>
      </button>
      <button type="button" :aria-pressed="level === 'middle'" :class="{ 'is-active': level === 'middle' }" @click="level = 'middle'">
        <span>Middle</span><small>Контекст и решения</small>
      </button>
    </div>

    <div class="interview-summary">
      <span class="interview-icon"><BriefcaseBusiness :size="20" aria-hidden="true" /></span>
      <span><strong>{{ pool.length }} вопросов</strong><small>Новый набор при каждом старте</small></span>
      <span v-if="completed" class="interview-progress"><CheckCircle2 :size="15" aria-hidden="true" /> {{ completed }}</span>
    </div>

    <QuizPlayer :key="level" :mode="`interview-${level}`" :pool="pool" :size="10" start-label="Начать подготовку" />
  </div>
</template>