<script setup>
import { computed, ref } from 'vue'
import { ArrowRight, Check, FileSearch, Lightbulb } from '@lucide/vue'
import { useProgress } from '../composables/useProgress.js'

const { progress, recordPracticeResult } = useProgress()
const phase = ref('probe')
const probe = ref('')
const cause = ref('')
const selectedTests = ref([])
const reportTitle = ref('')
const reportSteps = ref('')
const result = ref(null)
const probeWasUseful = computed(() => probe.value === 'payment-logs')
const expectedTests = ['same-idempotency-key', 'duplicate-callback']
const reportReady = computed(() => reportTitle.value.trim().length >= 12 && reportSteps.value.split(/\r?\n/).filter((step) => step.trim()).length >= 2)
const savedScore = computed(() => progress.practiceResults['detective-double-charge']?.bestScore ?? null)

const tests = [
  { id: 'same-idempotency-key', title: 'Повторить оплату после таймаута с тем же idempotency key' },
  { id: 'duplicate-callback', title: 'Повторно доставить callback платежа и проверить единственное списание' },
  { id: 'clear-cache', title: 'Очистить cache и сравнить цвета кнопки оплаты' },
  { id: 'change-browser', title: 'Повторить один запрос в другом браузере без сравнения transaction ID' },
]

function advanceProbe() {
  if (!probe.value) return
  phase.value = 'cause'
}

function advanceCause() {
  if (!cause.value) return
  phase.value = 'tests'
}

function showReport() {
  phase.value = 'report'
}

function submitInvestigation() {
  if (!reportReady.value) return
  const probeScore = probeWasUseful.value ? 20 : 0
  const causeScore = cause.value === 'missing-idempotency' ? 30 : 0
  const correctSelected = selectedTests.value.filter((id) => expectedTests.includes(id)).length
  const irrelevantSelected = selectedTests.value.filter((id) => !expectedTests.includes(id)).length
  const testScore = Math.max(0, correctSelected - irrelevantSelected) / expectedTests.length * 30
  const reportScore = 20
  const score = Math.round(probeScore + causeScore + testScore + reportScore)
  result.value = { score, probeScore, causeScore, testScore, reportScore }
  if (score >= 75) recordPracticeResult('detective-double-charge', score)
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
    <p class="eyebrow">QA DETECTIVE · ДЕЛО № 01</p>
    <h2>Двойное списание после таймаута</h2>
    <p class="activity-prompt">Поддержка сообщает: «Клиент не увидел подтверждение оплаты, нажал повторить и получил два списания». Разберись в цепочке, выбери проверку, установи вероятную причину и собери баг-репорт.</p>
    <div class="detective-case-meta"><span>Сложность · Junior+</span><span>4 этапа</span></div>

    <section v-if="phase === 'probe'" class="detective-stage">
      <div class="knowledge-label"><FileSearch :size="16" aria-hidden="true" /> ЭТАП 1 · ЧТО ИЗУЧИТЬ СНАЧАЛА?</div>
      <label class="detective-option"><input v-model="probe" type="radio" value="payment-logs"><span>Логи платёжных попыток и transaction ID после timeout.</span></label>
      <label class="detective-option"><input v-model="probe" type="radio" value="button-color"><span>Цвет и отступ кнопки подтверждения оплаты.</span></label>
      <label class="detective-option"><input v-model="probe" type="radio" value="browser-cache"><span>Состояние cache браузера на устройстве клиента.</span></label>
      <button class="button button-primary" type="button" :disabled="!probe" @click="advanceProbe">Изучить данные <ArrowRight :size="15" aria-hidden="true" /></button>
      <div v-if="probe && !probeWasUseful" class="detective-hint"><Lightbulb :size="15" aria-hidden="true" /> Начни с серверной цепочки оплаты: она покажет, сколько запросов дошло до провайдера.</div>
    </section>

    <section v-else-if="phase === 'cause'" class="detective-stage">
      <div class="knowledge-label"><FileSearch :size="16" aria-hidden="true" /> ЭТАП 2 · СОПОСТАВЬ ФАКТЫ</div>
      <div v-if="probeWasUseful" class="evidence-log"><code>10:14:03 POST /payments · order=ord-203 · idempotency_key=null · response=504</code><code>10:14:08 POST /payments · order=ord-203 · idempotency_key=null · response=201</code><code>provider transactions: txn-881 = 1 200 ₽, txn-882 = 1 200 ₽</code></div>
      <div v-else class="evidence-log"><code>10:14:03 POST /payments · order=ord-203 · response=504</code><code>10:14:08 POST /payments · order=ord-203 · response=201</code></div>
      <p v-if="probeWasUseful" class="detective-evidence-note">Обе попытки дошли до провайдера, ключ идемпотентности отсутствует, transaction ID разные.</p>
      <p v-else class="detective-evidence-note">Ты не запросил логи транзакций. Доступно только сообщение пользователя и общий статус заказа.</p>
      <label class="detective-option"><input v-model="cause" type="radio" value="missing-idempotency"><span>Повторный запрос не был идемпотентным, провайдер создал вторую транзакцию.</span></label>
      <label class="detective-option"><input v-model="cause" type="radio" value="bank-error"><span>Банк отобразил одно списание дважды, хотя сервис создал один платёж.</span></label>
      <label class="detective-option"><input v-model="cause" type="radio" value="stale-ui"><span>Интерфейс показал устаревший статус, серверный платёж только один.</span></label>
      <button class="button button-primary" type="button" :disabled="!cause" @click="advanceCause">Сформировать план проверок <ArrowRight :size="15" aria-hidden="true" /></button>
    </section>

    <section v-else-if="phase === 'tests'" class="detective-stage">
      <div class="knowledge-label"><Check :size="16" aria-hidden="true" /> ЭТАП 3 · ВЫБЕРИ ПРОВЕРКИ</div>
      <p class="activity-prompt">Отметь проверки, которые подтвердят защиту от повторного эффекта.</p>
      <label v-for="item in tests" :key="item.id" class="detective-option"><input v-model="selectedTests" type="checkbox" :value="item.id"><span>{{ item.title }}</span></label>
      <button class="button button-primary" type="button" :disabled="selectedTests.length === 0" @click="showReport">Составить отчёт <ArrowRight :size="15" aria-hidden="true" /></button>
    </section>

    <section v-else-if="phase === 'report'" class="detective-stage">
      <div class="knowledge-label"><FileSearch :size="16" aria-hidden="true" /> ЭТАП 4 · ЗАФИКСИРУЙ ДЕФЕКТ</div>
      <label class="lab-editor-label" for="detective-title">Заголовок баг-репорта</label><input id="detective-title" v-model="reportTitle" class="activity-input" maxlength="160" placeholder="Payments: повтор после timeout создаёт второе списание">
      <label class="lab-editor-label" for="detective-steps">Ключевые шаги воспроизведения</label><textarea id="detective-steps" v-model="reportSteps" class="lab-editor" rows="4" maxlength="600" placeholder="Создать заказ и начать оплату&#10;Имитировать timeout и повторить запрос&#10;Сверить число транзакций у провайдера"></textarea>
      <p class="lab-hint">{{ reportReady ? 'Отчёт заполнен, можно оценить расследование.' : 'Нужен конкретный заголовок и не менее двух шагов.' }}</p>
      <button class="button button-primary" type="button" :disabled="!reportReady" @click="submitInvestigation">Завершить расследование</button>
    </section>

    <section v-else-if="result" class="detective-stage activity-feedback" :class="{ 'is-success': result.score >= 80 }" role="status">
      <p class="eyebrow">ИТОГ РАССЛЕДОВАНИЯ</p><h3>{{ result.score >= 80 ? 'Причина найдена' : 'Дело закрыто с пробелами' }} · {{ result.score }}%</h3>
      <p>Вероятная причина: повторные запросы отправлялись без idempotency key, поэтому платёжный провайдер обработал их как разные операции.</p>
      <ul><li>Выбор источника данных: {{ result.probeScore }}/20</li><li>Гипотеза: {{ result.causeScore }}/30</li><li>План проверок: {{ result.testScore }}/30</li><li>Баг-репорт: {{ result.reportScore }}/20</li></ul>
      <p v-if="savedScore !== null">Лучший результат сохранён на этом устройстве: {{ savedScore }}%.</p>
      <button class="button button-quiet" type="button" @click="restart">Пройти расследование ещё раз</button>
    </section>
  </section>
</template>
