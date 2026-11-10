<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Check, CircleCheck, ClipboardCheck, LockKeyhole, RotateCcw, ShieldCheck, Workflow } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import { useProgress } from '../composables/useProgress.js'
import { qaProjects, scoreProject } from '../data/qaProjects.js'

const { progress, recordProjectAnswer } = useProgress()
const selectedId = ref(qaProjects[0].id)
const taskIndex = ref(0)
const selectedProject = computed(() => qaProjects.find(({ id }) => id === selectedId.value) ?? qaProjects[0])
const saved = computed(() => progress.projectProgress[selectedProject.value.id] ?? { answers: {}, bestScore: 0, completedAt: null })
const task = computed(() => selectedProject.value.tasks[taskIndex.value])
const result = computed(() => scoreProject(selectedProject.value, saved.value.answers))
const answeredCount = computed(() => Object.keys(saved.value.answers).length)
const currentAnswer = computed(() => saved.value.answers[task.value?.id] ?? '')

watch(selectedId, () => { taskIndex.value = 0 })

function choose(optionId) {
  recordProjectAnswer(selectedProject.value.id, task.value.id, optionId)
}

function selectProject(id) {
  selectedId.value = id
  taskIndex.value = 0
}
</script>

<template>
  <div class="page projects-page">
    <PageHeading eyebrow="АКАДЕМИЯ · ПРАКТИЧЕСКИЕ ПРОЕКТЫ" title="Собери решение по шагам" description="Три приближённых к работе кейса: защита API, интеграции и автоматизация. Решения и лучший результат сохраняются на устройстве." />

    <section class="project-picker" aria-label="Выбор сквозного проекта">
      <button v-for="item in qaProjects" :key="item.id" type="button" class="project-picker-card" :class="{ 'is-active': selectedId === item.id, 'is-complete': progress.projectProgress[item.id]?.bestScore >= 75 }" :aria-pressed="selectedId === item.id" @click="selectProject(item.id)">
        <span class="project-picker-icon"><ShieldCheck v-if="item.id === 'idor-security'" :size="18" aria-hidden="true" /><Workflow v-else-if="item.id === 'payment-webhook'" :size="18" aria-hidden="true" /><ClipboardCheck v-else :size="18" aria-hidden="true" /></span>
        <span><small>{{ item.category }}</small><strong>{{ item.title }}</strong></span>
        <CircleCheck v-if="progress.projectProgress[item.id]?.bestScore >= 75" :size="17" class="project-picker-done" aria-label="Проект сдан" />
      </button>
    </section>

    <section class="project-workbench" :aria-labelledby="`project-title-${selectedProject.id}`">
      <header class="project-workbench-heading">
        <div><p class="eyebrow">{{ selectedProject.category }}</p><h2 :id="`project-title-${selectedProject.id}`">{{ selectedProject.title }}</h2></div>
        <span class="project-best-score">Лучший <strong>{{ saved.bestScore }}%</strong></span>
      </header>
      <div class="project-brief"><span class="project-brief-icon"><LockKeyhole :size="17" aria-hidden="true" /></span><div><strong>Контекст проекта</strong><p>{{ selectedProject.brief }}</p></div></div>

      <div class="project-deliverable"><span>ТВОЙ РЕЗУЛЬТАТ</span><strong>{{ selectedProject.deliverable }}</strong><small>{{ answeredCount }} из {{ selectedProject.tasks.length }} решений выбрано</small></div>

      <div class="project-progress-track" role="progressbar" :aria-valuenow="Math.round(answeredCount * 100 / selectedProject.tasks.length)" aria-valuemin="0" aria-valuemax="100" aria-label="Прогресс проекта"><span :style="{ width: `${answeredCount * 100 / selectedProject.tasks.length}%` }" /></div>

      <article v-if="task" class="project-task-card">
        <div class="project-task-index"><span>ЭТАП {{ taskIndex + 1 }} / {{ selectedProject.tasks.length }}</span><span>{{ result.correct }} верно</span></div>
        <h3>{{ task.prompt }}</h3>
        <div class="project-options" role="group" :aria-label="task.prompt">
          <button v-for="(option, index) in task.options" :key="option.id" type="button" class="project-option" :class="{ 'is-selected': currentAnswer === option.id, 'is-correct': currentAnswer === option.id && option.correct, 'is-incorrect': currentAnswer === option.id && !option.correct }" :aria-pressed="currentAnswer === option.id" @click="choose(option.id)">
            <span class="project-option-letter">{{ String.fromCharCode(65 + index) }}</span><span>{{ option.label }}</span><Check v-if="currentAnswer === option.id && option.correct" :size="17" aria-label="Верно" /><span v-else-if="currentAnswer === option.id" class="project-option-cross" aria-label="Неверно">×</span>
          </button>
        </div>
        <p v-if="currentAnswer" class="project-explanation" :class="{ 'is-correct': task.options.find(({ id }) => id === currentAnswer)?.correct }" role="status">{{ task.explanation }}</p>
        <footer class="project-task-navigation">
          <button class="button button-quiet" type="button" :disabled="taskIndex === 0" @click="taskIndex--"><ArrowLeft :size="15" aria-hidden="true" /> Назад</button>
          <span>Лучший проход: {{ saved.bestScore }}%</span>
          <button v-if="taskIndex < selectedProject.tasks.length - 1" class="button button-primary" type="button" :disabled="!currentAnswer" @click="taskIndex++">Дальше <ArrowRight :size="15" aria-hidden="true" /></button>
          <button v-else class="button button-primary" type="button" :disabled="!result.complete" @click="taskIndex = 0"><RotateCcw :size="15" aria-hidden="true" /> Повторить</button>
        </footer>
      </article>

      <section v-if="result.complete" class="project-result" :class="{ 'is-passed': result.score >= 75 }" aria-live="polite">
        <span class="project-result-icon"><CircleCheck v-if="result.score >= 75" :size="22" aria-hidden="true" /><RotateCcw v-else :size="20" aria-hidden="true" /></span>
        <div><strong>{{ result.score >= 75 ? 'Проект сдан' : 'Есть что улучшить' }} · {{ result.score }}%</strong><p>{{ result.correct }} из {{ result.total }} решений соответствуют критериям. {{ result.score >= 75 ? 'Загляни в объяснения и переходи к следующему кейсу.' : 'Пересмотри решения и попробуй ещё раз.' }}</p></div>
      </section>
      <p class="project-local-note">Это учебная симуляция с фиксированными критериями, а не проверка production-системы. Официальный XP за проекты не начисляется.</p>
    </section>
  </div>
</template>
