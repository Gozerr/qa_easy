<script setup>
import { computed, ref } from 'vue'
import { ArrowRight, Check, FileSearch, Lightbulb, RotateCcw } from '@lucide/vue'
import { useProgress } from '../composables/useProgress.js'
import { detectiveCases } from '../data/detectiveCases.js'

const { progress, recordPracticeResult } = useProgress()
const selectedCaseId = ref(detectiveCases[0].id)
const activeCase = computed(() => detectiveCases.find(({ id }) => id === selectedCaseId.value) ?? detectiveCases[0])
const phase = ref('probe')
const probe = ref('')
const cause = ref('')
const selectedTests = ref([])
const reportTitle = ref('')
const reportSteps = ref('')
const result = ref(null)
const probeWasUseful = computed(() => activeCase.value.probes.find(({ id }) => id === probe.value)?.useful === true)
const reportReady = computed(() => reportTitle.value.trim().length >= 12 && reportSteps.value.split(/\r?\n/).filter((step) => step.trim()).length >= 2)
const savedScore = computed(() => progress.practiceResults[activeCase.value.progressId]?.bestScore ?? null)

function selectCase(id) {
  selectedCaseId.value = id
  restart()
}

function advanceProbe() {
  if (probe.value) phase.value = 'cause'
}

function advanceCause() {
  if (cause.value) phase.value = 'tests'
}

function submitInvestigation() {
  if (!reportReady.value) return
  const probeScore = probeWasUseful.value ? 20 : 0
  const causeScore = cause.value === activeCase.value.correctCauseId ? 30 : 0
  const correctSelected = selectedTests.value.filter((id) => activeCase.value.expectedTests.includes(id)).length
  const irrelevantSelected = selectedTests.value.filter((id) => !activeCase.value.expectedTests.includes(id)).length
  const testScore = Math.max(0, correctSelected - irrelevantSelected) / activeCase.value.expectedTests.length * 30
  const reportScore = 20
  const score = Math.round(probeScore + causeScore + testScore + reportScore)
  result.value = { score, probeScore, causeScore, testScore, reportScore }
  recordPracticeResult(activeCase.value.progressId, score)
  phase.value = 'result'
}

function restart() {
  phase.value = 'probe'
  probe.value = ''
  cause.value = ''
  selectedTests.value = []
  reportTitle.value = ''
  reportSteps.value = ''
  result.value = null
}
</script>

<template>
  <section class="activity-card detective-card">
    <p class="eyebrow">QA DETECTIVE · {{ detectiveCases.length }} ДЕЛА</p>
    <div class="detective-case-picker" role="group" aria-label="Выбор дела QA Detective">
      <button v-for="item in detectiveCases" :key="item.id" type="button" :class="{ 'is-active': item.id === activeCase.id }" :aria-pressed="item.id === activeCase.id" @click="selectCase(item.id)">
        <span>ДЕЛО {{ String(detectiveCases.indexOf(item) + 1).padStart(2, '0') }} · {{ item.difficulty }}</span>
        <strong>{{ item.title }}</strong>
        <small v-if="progress.practiceResults[item.progressId]">Лучший результат {{ progress.practiceResults[item.progressId].bestScore }}%</small>
      </button>
    </div>
    <h2>{{ activeCase.title }}</h2>
    <p class="activity-prompt">{{ activeCase.prompt }}</p>
    <div class="detective-case-meta"><span>Сложность · {{ activeCase.difficulty }}</span><span>4 этапа</span></div>

    <section v-if="phase === 'probe'" class="detective-stage">
      <div class="knowledge-label"><FileSearch :size="16" aria-hidden="true" /> ЭТАП 1 · ЧТО ИЗУЧИТЬ СНАЧАЛА?</div>
      <label v-for="option in activeCase.probes" :key="option.id" class="detective-option"><input v-model="probe" type="radio" :value="option.id"><span>{{ option.label }}</span></label>
      <button class="button button-primary" type="button" :disabled="!probe" @click="advanceProbe">Изучить данные <ArrowRight :size="15" aria-hidden="true" /></button>
      <div v-if="probe && !probeWasUseful" class="detective-hint"><Lightbulb :size="15" aria-hidden="true" /> Выбери источник, который помогает проверить цепочку действий и состояние объекта на сервере.</div>
    </section>

    <section v-else-if="phase === 'cause'" class="detective-stage">
      <div class="knowledge-label"><FileSearch :size="16" aria-hidden="true" /> ЭТАП 2 · СОПОСТАВЬ ФАКТЫ</div>
      <div class="evidence-log"><code v-for="line in activeCase.evidence" :key="line">{{ line }}</code></div>
      <p class="detective-evidence-note">{{ probeWasUseful ? activeCase.usefulEvidence : activeCase.limitedEvidence }}</p>
      <label v-for="option in activeCase.causes" :key="option.id" class="detective-option"><input v-model="cause" type="radio" :value="option.id"><span>{{ option.label }}</span></label>
      <button class="button button-primary" type="button" :disabled="!cause" @click="advanceCause">Сформировать план проверок <ArrowRight :size="15" aria-hidden="true" /></button>
    </section>

    <section v-else-if="phase === 'tests'" class="detective-stage">
      <div class="knowledge-label"><Check :size="16" aria-hidden="true" /> ЭТАП 3 · ВЫБЕРИ ПРОВЕРКИ</div>
      <p class="activity-prompt">Отметь проверки, которые подтвердят причину и помогут исключить повтор дефекта.</p>
      <label v-for="item in activeCase.tests" :key="item.id" class="detective-option"><input v-model="selectedTests" type="checkbox" :value="item.id"><span>{{ item.title }}</span></label>
      <button class="button button-primary" type="button" :disabled="selectedTests.length === 0" @click="phase = 'report'">Составить отчёт <ArrowRight :size="15" aria-hidden="true" /></button>
    </section>

    <section v-else-if="phase === 'report'" class="detective-stage">
      <div class="knowledge-label"><FileSearch :size="16" aria-hidden="true" /> ЭТАП 4 · ЗАФИКСИРУЙ ДЕФЕКТ</div>
      <label class="lab-editor-label" for="detective-title">Заголовок баг-репорта</label><input id="detective-title" v-model="reportTitle" class="activity-input" maxlength="160" :placeholder="`${activeCase.title}: наблюдаемое последствие`">
      <label class="lab-editor-label" for="detective-steps">Ключевые шаги воспроизведения</label><textarea id="detective-steps" v-model="reportSteps" class="lab-editor" rows="4" maxlength="600" placeholder="Создать контролируемые тестовые данные&#10;Воспроизвести запрос или событие&#10;Проверить фактическое состояние и побочный эффект"></textarea>
      <p class="lab-hint">{{ reportReady ? 'Отчёт заполнен, можно оценить расследование.' : 'Нужен конкретный заголовок и не менее двух шагов.' }}</p>
      <button class="button button-primary" type="button" :disabled="!reportReady" @click="submitInvestigation">Завершить расследование</button>
    </section>

    <section v-else-if="result" class="detective-stage activity-feedback" :class="{ 'is-success': result.score >= 75 }" role="status">
      <p class="eyebrow">ИТОГ · {{ activeCase.title }}</p><h3>{{ result.score >= 75 ? 'Причина обоснована' : 'В плане есть пробелы' }} · {{ result.score }}%</h3>
      <p>{{ activeCase.usefulEvidence }}</p>
      <ul><li>Выбор источника данных: {{ result.probeScore }}/20</li><li>Гипотеза: {{ result.causeScore }}/30</li><li>План проверок: {{ result.testScore }}/30</li><li>Баг-репорт: {{ result.reportScore }}/20</li></ul>
      <p v-if="savedScore !== null">Лучший результат по этому делу: {{ savedScore }}%.</p>
      <button class="button button-quiet" type="button" @click="restart"><RotateCcw :size="15" aria-hidden="true" /> Пройти ещё раз</button>
    </section>
  </section>
</template>
