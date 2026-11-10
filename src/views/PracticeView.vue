<script setup>
import { computed, ref } from 'vue'
import { Bug, FileSearch, Lightbulb, NotebookPen, ScrollText } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import DetectiveGame from '../components/DetectiveGame.vue'
import TestCaseConstructor from '../components/TestCaseConstructor.vue'
import BugReportChallenge from '../components/BugReportChallenge.vue'
import { useQuestionBank } from '../composables/useQuestionBank.js'

const { questions } = useQuestionBank()
const scenarios = computed(() => questions.value.filter(({ category }) => category === 'scenarios'))
const mode = ref('bugs')
</script>

<template>
  <div class="page">
    <PageHeading eyebrow="ПРАКТИКА · ТРЕНАЖЁРЫ QA" title="Практика" description="Ищи дефекты, расследуй причины и тренируй рабочие артефакты тестировщика." />
    <div class="practice-tabs" role="group" aria-label="Выбор практического задания">
      <button type="button" :aria-pressed="mode === 'bugs'" :class="{ 'is-active': mode === 'bugs' }" @click="mode = 'bugs'"><Bug :size="15" aria-hidden="true" /> Найди багулю</button>
      <button type="button" :aria-pressed="mode === 'detective'" :class="{ 'is-active': mode === 'detective' }" @click="mode = 'detective'"><FileSearch :size="15" aria-hidden="true" /> QA Detective</button>
      <button type="button" :aria-pressed="mode === 'cases'" :class="{ 'is-active': mode === 'cases' }" @click="mode = 'cases'"><NotebookPen :size="15" aria-hidden="true" /> Тест-кейсы</button>
      <button type="button" :aria-pressed="mode === 'report'" :class="{ 'is-active': mode === 'report' }" @click="mode = 'report'"><ScrollText :size="15" aria-hidden="true" /> Баг-репорт</button>
    </div>

    <template v-if="mode === 'bugs'">
      <div class="practice-note"><span><Lightbulb :size="18" aria-hidden="true" /></span><p>Проверяй не только то, что видно на экране. Иногда важнее всего, как система ведёт себя на границах и при сбое.</p></div>
      <div class="section-kicker"><Bug :size="16" aria-hidden="true" /> ТРЕНАЖЁР</div>
      <QuizPlayer mode="practice" :pool="scenarios" :size="10" />
    </template>
    <DetectiveGame v-else-if="mode === 'detective'" />
    <TestCaseConstructor v-else-if="mode === 'cases'" />
    <BugReportChallenge v-else />
  </div>
</template>
