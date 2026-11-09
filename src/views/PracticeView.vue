<script setup>
import { computed } from 'vue'
import { Bug, Lightbulb } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import { useQuestionBank } from '../composables/useQuestionBank.js'

const { questions } = useQuestionBank()
const scenarios = computed(() => questions.value.filter(({ category }) => category === 'scenarios'))
</script>

<template>
  <div class="page">
    <PageHeading eyebrow="ПРАКТИКА · 10 СЦЕНАРИЕВ" title="Найди багулю" description="Не угадываем по кнопке. Читаем ситуацию, ищем риск и выбираем, что проверить." />
    <div class="practice-note">
      <span><Lightbulb :size="18" aria-hidden="true" /></span>
      <p>Проверяй не только то, что видно на экране. Иногда важнее всего, как система ведёт себя на границах и при сбое.</p>
    </div>
    <div class="section-kicker"><Bug :size="16" aria-hidden="true" /> ТРЕНАЖЁР</div>
    <QuizPlayer mode="practice" :pool="scenarios" :size="10" />
  </div>
</template>