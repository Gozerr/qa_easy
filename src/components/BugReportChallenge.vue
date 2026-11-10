<script setup>
import { computed, reactive, ref } from 'vue'
import { Check } from '@lucide/vue'
import { useProgress } from '../composables/useProgress.js'

const { progress, recordPracticeResult } = useProgress()
const report = reactive({
  title: '',
  environment: '',
  preconditions: '',
  steps: '',
  actual: '',
  expected: '',
  severity: '',
  priority: '',
})
const issues = [
  { id: 'double-charge', activityId: 'bug-report-double-charge', title: 'Двойное списание после таймаута', prompt: 'После сетевого таймаута пользователь повторил оплату, и с карты списали деньги дважды. Составь отчёт, по которому команда сможет воспроизвести дефект и понять его влияние.', placeholder: 'Платёж: повтор после таймаута создаёт второе списание' },
  { id: 'idor-order', activityId: 'bug-report-order-access', title: 'Доступ к чужому заказу', prompt: 'Пользователь заменил ID заказа в API и увидел имя и адрес другого клиента. Зафиксируй нарушенную границу доступа и влияние на приватность.', placeholder: 'Orders API: изменение ID открывает чужой адрес доставки' },
  { id: 'duplicate-notice', activityId: 'bug-report-duplicate-notification', title: 'Дублирующееся уведомление', prompt: 'После временной ошибки почтового сервиса клиент получил два одинаковых письма о доставке. Опиши повторную доставку события и ожидаемое поведение.', placeholder: 'Уведомления: повтор события отправляет письмо дважды' },
]
const selectedIssueId = ref(issues[0].id)
const activeIssue = computed(() => issues.find(({ id }) => id === selectedIssueId.value) ?? issues[0])
const evaluated = ref(false)
const steps = computed(() => report.steps.split(/\r?\n/).map((step) => step.trim()).filter(Boolean))
const checks = computed(() => [
  { label: 'Заголовок коротко описывает дефект', passed: report.title.trim().length >= 12 },
  { label: 'Указано окружение', passed: report.environment.trim().length >= 5 },
  { label: 'Есть предусловия', passed: report.preconditions.trim().length >= 5 },
  { label: 'Шаги воспроизводимы и пронумерованы строками', passed: steps.value.length >= 2 },
  { label: 'Фактический результат описан', passed: report.actual.trim().length >= 8 },
  { label: 'Ожидаемый результат отличается и проверяем', passed: report.expected.trim().length >= 8 && report.expected.trim() !== report.actual.trim() },
  { label: 'Выбрана серьёзность', passed: Boolean(report.severity) },
  { label: 'Выбран приоритет', passed: Boolean(report.priority) },
])
const score = computed(() => Math.round(checks.value.filter(({ passed }) => passed).length / checks.value.length * 100))
const saved = computed(() => progress.practiceResults[activeIssue.value.activityId]?.bestScore === 100)

function changeIssue() {
  for (const key of Object.keys(report)) report[key] = ''
  evaluated.value = false
}

function evaluateReport() {
  evaluated.value = true
  if (checks.value.every(({ passed }) => passed)) recordPracticeResult(activeIssue.value.activityId, 100)
}
</script>

<template>
  <section class="activity-card">
    <p class="eyebrow">BUG REPORT CHALLENGE · {{ issues.length }} ДЕФЕКТА</p>
    <label class="case-scenario-picker"><span>Выбери дефект</span><select v-model="selectedIssueId" aria-label="Выбери дефект для баг-репорта" @change="changeIssue"><option v-for="issue in issues" :key="issue.id" :value="issue.id">{{ issue.title }}</option></select></label>
    <h2>{{ activeIssue.title }}</h2>
    <p class="activity-prompt">{{ activeIssue.prompt }}</p>

    <div class="bug-report-form">
      <label><span>Заголовок</span><input v-model="report.title" maxlength="160" :placeholder="activeIssue.placeholder"></label>
      <label><span>Окружение</span><input v-model="report.environment" maxlength="160" placeholder="ОС, браузер, версия приложения"></label>
      <label><span>Предусловия</span><textarea v-model="report.preconditions" rows="2" maxlength="300" placeholder="Пользователь вошёл, заказ создан…"></textarea></label>
      <label><span>Шаги · каждый с новой строки</span><textarea v-model="report.steps" rows="4" maxlength="700" placeholder="1. Создать заказ…&#10;2. Начать оплату…&#10;3. Повторить запрос после таймаута…"></textarea></label>
      <label><span>Фактический результат</span><textarea v-model="report.actual" rows="2" maxlength="300"></textarea></label>
      <label><span>Ожидаемый результат</span><textarea v-model="report.expected" rows="2" maxlength="300"></textarea></label>
      <label><span>Severity</span><select v-model="report.severity"><option disabled value="">Выбери влияние</option><option>Критическая</option><option>Высокая</option><option>Средняя</option><option>Низкая</option></select></label>
      <label><span>Priority</span><select v-model="report.priority"><option disabled value="">Выбери срочность</option><option>Немедленно</option><option>Высокий</option><option>Обычный</option><option>Низкий</option></select></label>
    </div>

    <div class="activity-actions"><button class="button button-primary" type="button" @click="evaluateReport">Проверить баг-репорт</button><span>Заполнено {{ checks.filter(({ passed }) => passed).length }} из {{ checks.length }} критериев</span></div>
    <div v-if="evaluated" class="activity-feedback" :class="{ 'is-success': score === 100 }" role="status">
      <strong>{{ score === 100 ? 'Отчёт можно передавать команде.' : `Полнота отчёта: ${score}%.` }}</strong>
      <ul><li v-for="check in checks" :key="check.label" :class="{ 'is-passed': check.passed }"><Check :size="13" aria-hidden="true" />{{ check.label }}</li></ul>
      <small v-if="saved">Полный отчёт сохранён на этом устройстве.</small>
    </div>
  </section>
</template>
