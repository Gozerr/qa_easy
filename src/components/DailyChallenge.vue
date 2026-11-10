<script setup>
import { computed, ref } from 'vue'
import { Check, FilePlus2, ListChecks } from '@lucide/vue'
import { useProgress } from '../composables/useProgress.js'
import { validateDailyChallenge } from '../lib/dailyChallenge.js'

const props = defineProps({
  task: { type: Object, required: true },
  date: { type: String, required: true },
})
const { progress, recordDailyChallenge } = useProgress()
const previous = computed(() => progress.dailyChallenges[props.date]?.response ?? {})
const testCases = ref(previous.value.cases?.length ? previous.value.cases.map((item) => ({ ...item })) : [
  { type: 'positive', condition: '', expected: '' },
  { type: 'negative', condition: '', expected: '' },
])
const report = ref({
  title: previous.value.title ?? '',
  environment: previous.value.environment ?? '',
  preconditions: previous.value.preconditions ?? '',
  steps: previous.value.steps ?? '',
  actual: previous.value.actual ?? '',
  expected: previous.value.expected ?? '',
  severity: previous.value.severity ?? '',
  priority: previous.value.priority ?? '',
})
const validation = computed(() => validateDailyChallenge(props.task.activityType, props.task.activityType === 'test-design'
  ? { cases: testCases.value }
  : report.value))
const alreadyCompleted = computed(() => Boolean(progress.dailyChallenges[props.date]?.completedAt))

function save() {
  recordDailyChallenge(props.date, props.task.activityType, props.task.activityType === 'test-design'
    ? { cases: testCases.value }
    : report.value)
}
</script>

<template>
  <section class="daily-challenge activity-card" :aria-labelledby="`daily-challenge-${task.activityType}`">
    <div class="daily-challenge-heading">
      <span class="daily-detail-icon"><ListChecks v-if="task.activityType === 'test-design'" :size="18" aria-hidden="true" /><FilePlus2 v-else :size="18" aria-hidden="true" /></span>
      <span class="eyebrow">{{ task.activityType === 'test-design' ? 'МИНИ-ПРОЕКТ · ТЕСТ-ДИЗАЙН' : 'МИНИ-ПРОЕКТ · BUG REPORT' }}</span>
    </div>

    <template v-if="task.activityType === 'test-design'">
      <h2 :id="`daily-challenge-${task.activityType}`">Преврати сценарий в проверки</h2>
      <p class="daily-challenge-instruction">По заданию дня составь минимум два кейса разных типов. Для каждого укажи входные данные или условие и наблюдаемый результат.</p>
      <div v-for="(item, index) in testCases" :key="index" class="daily-test-case">
        <strong>Кейс {{ index + 1 }}</strong>
        <label><span>Класс покрытия</span><select v-model="item.type"><option value="positive">Позитивный</option><option value="negative">Негативный</option><option value="boundary">Граничный</option><option value="validation">Валидация</option></select></label>
        <label><span>Условие или данные</span><input v-model="item.condition" maxlength="300" :aria-label="`Условие кейса ${index + 1}`" placeholder="Например: повторить запрос после timeout"></label>
        <label><span>Ожидаемый результат</span><textarea v-model="item.expected" rows="2" maxlength="300" :aria-label="`Ожидаемый результат кейса ${index + 1}`" placeholder="Какое состояние должно наблюдаться?"></textarea></label>
      </div>
      <p class="daily-challenge-rubric">Автопроверка: заполнены оба кейса и выбраны разные классы покрытия.</p>
    </template>

    <template v-else>
      <h2 :id="`daily-challenge-${task.activityType}`">Составь воспроизводимый баг-репорт</h2>
      <p class="daily-challenge-instruction">Используй задание дня как отправную точку. Зафиксируй данные, шаги и различие между фактическим и ожидаемым результатом.</p>
      <div class="daily-report-fields">
        <label><span>Заголовок</span><input v-model="report.title" maxlength="160" placeholder="Компонент: условие — последствие"></label>
        <label><span>Окружение</span><input v-model="report.environment" maxlength="160" placeholder="Устройство, версия, среда"></label>
        <label><span>Предусловия</span><textarea v-model="report.preconditions" rows="2" maxlength="300" placeholder="Тестовые данные и исходное состояние"></textarea></label>
        <label><span>Шаги · каждый с новой строки</span><textarea v-model="report.steps" rows="3" maxlength="700" placeholder="1. Подготовить данные…&#10;2. Выполнить действие…"></textarea></label>
        <label><span>Фактический результат</span><textarea v-model="report.actual" rows="2" maxlength="300"></textarea></label>
        <label><span>Ожидаемый результат</span><textarea v-model="report.expected" rows="2" maxlength="300"></textarea></label>
        <label><span>Серьёзность</span><select v-model="report.severity"><option disabled value="">Выбери влияние</option><option>Критическая</option><option>Высокая</option><option>Средняя</option><option>Низкая</option></select></label>
        <label><span>Приоритет</span><select v-model="report.priority"><option disabled value="">Выбери срочность</option><option>Немедленно</option><option>Высокий</option><option>Обычный</option><option>Низкий</option></select></label>
      </div>
      <p class="daily-challenge-rubric">Автопроверка структуры: заголовок, окружение, предусловия, шаги, разные фактический и ожидаемый результаты, серьёзность и приоритет.</p>
    </template>

    <div class="activity-actions">
      <button class="button button-primary" type="button" :disabled="!validation" @click="save"><Check v-if="alreadyCompleted" :size="15" aria-hidden="true" /> {{ alreadyCompleted ? 'Обновить ответ' : 'Сохранить задание' }}</button>
      <span>{{ validation ? 'Критерии заполнены' : 'Заполни обязательные поля' }}</span>
    </div>
    <p v-if="alreadyCompleted" class="daily-challenge-saved" role="status">Ответ сохранён на этом устройстве · {{ date }} UTC</p>
    <p class="daily-challenge-local-note">Рефлексивная практика проверяет структуру ответа, не истинность продуктовых фактов. Она сохраняется локально и не начисляет официальный XP.</p>
  </section>
</template>
