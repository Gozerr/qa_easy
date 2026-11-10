<script setup>
import { computed, ref, watch } from 'vue'
import { Braces, Check, Database, Play, RotateCcw, Table2, Wrench } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import { useProgress } from '../composables/useProgress.js'
import { runSqlQuery, sqlTables } from '../lib/sqlSandbox.js'

const { progress, recordPracticeResult } = useProgress()
const mode = ref('sql')
const exerciseIndex = ref(0)
const sqlQuery = ref('')
const apiJson = ref('')
const sqlResult = ref(null)
const apiResult = ref(null)

const sqlExercises = [
  { id: 'active-users', title: 'Активные пользователи', table: 'users', instruction: 'Выведи id и email активных пользователей, отсортируй результат по id по возрастанию.', starter: 'SELECT id, email FROM users', solution: 'SELECT id, email FROM users WHERE active = true ORDER BY id ASC' },
  { id: 'largest-orders', title: 'Крупные заказы', table: 'orders', instruction: 'Найди заказы от 50 единиц и отсортируй по сумме от большей к меньшей. Оставь две первые строки.', starter: 'SELECT id, total FROM orders', solution: 'SELECT id, total FROM orders WHERE total >= 50 ORDER BY total DESC LIMIT 2' },
  { id: 'pending-orders', title: 'Ожидающие заказы', table: 'orders', instruction: "Выведи id и user_id заказов со статусом 'pending', упорядочи по id.", starter: 'SELECT id, user_id FROM orders', solution: "SELECT id, user_id FROM orders WHERE status = 'pending' ORDER BY id ASC" },
  { id: 'orders-with-users', title: 'Связи клиентов и заказов', table: 'users', joinTable: 'orders', instruction: 'Соедини пользователей с заказами, чтобы сохранить клиентов без заказов. Выведи имя, id заказа и сумму, отсортируй по id пользователя и заказа.', starter: 'SELECT users.name, orders.id, orders.total FROM users INNER JOIN orders ON users.id = orders.user_id ORDER BY orders.id', solution: 'SELECT users.name, orders.id, orders.total FROM users LEFT JOIN orders ON users.id = orders.user_id ORDER BY users.id, orders.id' },
  { id: 'orphan-orders', title: 'Заказ без владельца', table: 'orders', joinTable: 'users', instruction: 'Найди заказы, для которых не удалось найти пользователя. Используй LEFT JOIN и проверку отсутствующей связи.', starter: 'SELECT orders.id, users.name FROM orders INNER JOIN users ON orders.user_id = users.id', solution: 'SELECT orders.id FROM orders LEFT JOIN users ON orders.user_id = users.id WHERE users.id IS NULL' },
  { id: 'user-order-summary', title: 'Сводка по заказам', table: 'users', joinTable: 'orders', instruction: 'Для каждого пользователя посчитай число заказов и сумму, включая тех, у кого заказов нет. Отсортируй по сумме по убыванию.', starter: 'SELECT users.name, COUNT(orders.id) AS order_count FROM users INNER JOIN orders ON users.id = orders.user_id GROUP BY users.name', solution: 'SELECT users.name, COUNT(orders.id) AS order_count, SUM(orders.total) AS total FROM users LEFT JOIN orders ON users.id = orders.user_id GROUP BY users.id, users.name ORDER BY total DESC' },
]

const apiExercises = [
  {
    id: 'payment-response', title: 'Статус платежа',
    instruction: 'Проверь согласованность ответа API: успешный заказ не должен содержать отказавшийся платёж, а списание должно совпадать с суммой заказа.',
    starter: JSON.stringify({ orderId: 'ord-104', status: 'paid', total: 1299, payment: { status: 'failed', amount: 1199 }, currency: 'RUB' }, null, 2),
    validate(value) {
      const order = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const payment = order.payment && typeof order.payment === 'object' && !Array.isArray(order.payment) ? order.payment : {}
      return [
        { label: 'Заказ и платёж имеют одинаковый итоговый статус', passed: typeof order.status === 'string' && order.status === payment.status },
        { label: 'Сумма списания совпадает с суммой заказа', passed: Number.isFinite(order.total) && order.total === payment.amount },
        { label: 'В ответе есть идентификатор заказа и валюта', passed: typeof order.orderId === 'string' && order.orderId.length > 0 && typeof order.currency === 'string' },
      ]
    },
  },
  {
    id: 'pagination-response', title: 'Пагинация без пропусков',
    instruction: 'Проверь страницу 3 при размере страницы 5 и общем количестве 12 записей. На последней странице должны остаться только две записи.',
    starter: JSON.stringify({ page: 3, perPage: 5, total: 12, items: [{ id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }, { id: 15 }] }, null, 2),
    validate(value) {
      const response = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const validMeta = Number.isInteger(response.page) && response.page > 0 && Number.isInteger(response.perPage) && response.perPage > 0 && Number.isInteger(response.total) && response.total >= 0
      const expectedItems = validMeta ? Math.max(0, Math.min(response.perPage, response.total - (response.page - 1) * response.perPage)) : -1
      return [
        { label: 'Номер страницы, размер и общее количество — целые числа', passed: validMeta },
        { label: `На этой странице ровно ${Math.max(0, expectedItems)} записей`, passed: validMeta && Array.isArray(response.items) && response.items.length === expectedItems },
        { label: 'Элементы представлены объектами с id', passed: Array.isArray(response.items) && response.items.every((item) => item && typeof item === 'object' && !Array.isArray(item) && item.id !== undefined) },
      ]
    },
  },
  {
    id: 'error-contract', title: 'Безопасный ответ об ошибке',
    instruction: 'Исправь контракт ошибки валидации: клиент должен получить 4xx и понятное сообщение без stack trace и внутренних путей.',
    starter: JSON.stringify({ status: 200, body: { error: { message: 'Invalid amount', stack: 'Error at /srv/private/payment.ts:42' } } }, null, 2),
    validate(value) {
      const response = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const body = response.body && typeof response.body === 'object' && !Array.isArray(response.body) ? response.body : {}
      const error = body.error && typeof body.error === 'object' && !Array.isArray(body.error) ? body.error : {}
      return [
        { label: 'Ошибка имеет клиентский HTTP-статус 4xx', passed: Number.isInteger(response.status) && response.status >= 400 && response.status < 500 },
        { label: 'Есть стабильный код и понятное сообщение', passed: typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.code) && typeof error.message === 'string' && error.message.trim().length > 0 && error.message.length <= 240 },
        { label: 'В ответ не попали stack trace и внутренние пути', passed: !Object.hasOwn(error, 'stack') && !Object.hasOwn(error, 'trace') && !Object.hasOwn(error, 'path') },
      ]
    },
  },
  {
    id: 'payment-idempotency', title: 'Повтор платежа безопасен',
    instruction: 'Смоделируй повтор того же запроса после тайм-аута. Повтор должен вернуть прежнюю транзакцию и не создать новое списание.',
    starter: JSON.stringify({ idempotencyKey: 'pay-42', first: { status: 'paid', transactionId: 'txn-101', amount: 500 }, retry: { status: 'paid', transactionId: 'txn-102', amount: 500 }, chargeCount: 2 }, null, 2),
    validate(value) {
      const response = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const first = response.first && typeof response.first === 'object' && !Array.isArray(response.first) ? response.first : {}
      const retry = response.retry && typeof response.retry === 'object' && !Array.isArray(response.retry) ? response.retry : {}
      return [
        { label: 'Повтор использует исходный idempotency key', passed: typeof response.idempotencyKey === 'string' && response.idempotencyKey.length >= 3 },
        { label: 'Повтор возвращает ту же транзакцию и сумму', passed: typeof first.transactionId === 'string' && first.transactionId === retry.transactionId && Number.isFinite(first.amount) && first.amount === retry.amount && first.status === 'paid' && retry.status === 'paid' },
        { label: 'Провайдер выполнил только одно списание', passed: response.chargeCount === 1 },
      ]
    },
  },
  {
    id: 'authorization-boundaries', title: 'Границы доступа API',
    instruction: 'Разбери два запроса: без токена должен быть отказ 401, а вошедшему пользователю без роли администратора — 403. В обоих случаях приватные данные не выдаются.',
    starter: JSON.stringify({
      requests: [
        { actorId: null, role: null, resourceOwnerId: 'user-200', response: { status: 200, body: { id: 'user-200', email: 'private@example.test' } } },
        { actorId: 'user-100', role: 'user', resourceOwnerId: 'admin', response: { status: 200, body: { id: 'admin', email: 'admin@example.test', secret: 'internal' } } },
      ],
    }, null, 2),
    validate(value) {
      const requests = Array.isArray(value?.requests) ? value.requests : []
      const unauthenticated = requests[0] && typeof requests[0] === 'object' ? requests[0] : {}
      const forbidden = requests[1] && typeof requests[1] === 'object' ? requests[1] : {}
      const hasSafeError = (request, expectedStatus, expectedCode) => {
        const response = request.response && typeof request.response === 'object' ? request.response : {}
        const body = response.body && typeof response.body === 'object' ? response.body : {}
        const error = body.error && typeof body.error === 'object' ? body.error : {}
        return response.status === expectedStatus && error.code === expectedCode && !Object.hasOwn(body, 'data') && !Object.hasOwn(body, 'secret')
      }
      return [
        { label: 'Запрос без пользователя получает 401 UNAUTHENTICATED', passed: unauthenticated.actorId == null && hasSafeError(unauthenticated, 401, 'UNAUTHENTICATED') },
        { label: 'Пользователь без роли admin получает 403 FORBIDDEN', passed: forbidden.role === 'user' && forbidden.actorId !== forbidden.resourceOwnerId && hasSafeError(forbidden, 403, 'FORBIDDEN') },
        { label: 'Ни один отказ не раскрывает приватный ресурс', passed: requests.length === 2 && requests.every(({ response }) => response?.status === 401 || response?.status === 403) && requests.every(({ response }) => !Object.hasOwn(response?.body ?? {}, 'data') && !Object.hasOwn(response?.body ?? {}, 'secret')) },
      ]
    },
  },
  {
    id: 'webhook-retries', title: 'Повторная доставка webhook',
    instruction: 'Провайдер доставил одно событие оплаты дважды. Убедись, что обе доставки подтверждены, но событие и изменение заказа применены только один раз.',
    starter: JSON.stringify({
      deliveries: [{ eventId: 'evt-900', responseStatus: 500 }, { eventId: 'evt-900', responseStatus: 500 }],
      processedEventIds: ['evt-900', 'evt-900'],
      appliedTransitions: 2,
      orderStatus: 'paid',
    }, null, 2),
    validate(value) {
      const deliveries = Array.isArray(value?.deliveries) ? value.deliveries : []
      const ids = deliveries.map(({ eventId }) => eventId)
      const uniqueEvents = new Set(value?.processedEventIds ?? [])
      return [
        { label: 'Обе доставки относятся к одному событию', passed: deliveries.length === 2 && ids[0] && ids[0] === ids[1] },
        { label: 'Обе доставки получили успешное подтверждение 2xx', passed: deliveries.every(({ responseStatus }) => Number.isInteger(responseStatus) && responseStatus >= 200 && responseStatus < 300) },
        { label: 'Событие зарегистрировано один раз и заказ изменён один раз', passed: uniqueEvents.size === 1 && uniqueEvents.has(ids[0]) && value?.processedEventIds?.length === 1 && value?.appliedTransitions === 1 && value?.orderStatus === 'paid' },
      ]
    },
  },
]

const currentSql = computed(() => sqlExercises[exerciseIndex.value % sqlExercises.length])
const currentApi = computed(() => apiExercises[exerciseIndex.value % apiExercises.length])
const sqlDoneCount = computed(() => sqlExercises.filter(({ id }) => progress.practiceResults[`sql-${id}`]?.bestScore === 100).length)
const apiDoneCount = computed(() => apiExercises.filter(({ id }) => progress.practiceResults[`api-${id}`]?.bestScore === 100).length)
const activeTables = computed(() => [...new Set([currentSql.value.table, currentSql.value.joinTable].filter(Boolean))].map((name) => ({ name, rows: sqlTables[name], columns: Object.keys(sqlTables[name][0] ?? {}) })))
const apiChecks = computed(() => apiResult.value?.checks ?? [])

watch(currentSql, (exercise) => {
  sqlQuery.value = exercise.starter
  sqlResult.value = null
}, { immediate: true })
watch(currentApi, (exercise) => {
  apiJson.value = exercise.starter
  apiResult.value = null
}, { immediate: true })

function selectMode(nextMode) {
  mode.value = nextMode
  exerciseIndex.value = 0
}

function runQuery() {
  const result = runSqlQuery(sqlQuery.value)
  const expected = runSqlQuery(currentSql.value.solution)
  const correct = !result.error && !expected.error && JSON.stringify(result.rows) === JSON.stringify(expected.rows)
  sqlResult.value = { ...result, correct }
  if (correct) recordPracticeResult(`sql-${currentSql.value.id}`, 100)
}

function checkApiResponse() {
  try {
    const value = JSON.parse(apiJson.value)
    const checks = currentApi.value.validate(value)
    const correct = checks.every(({ passed }) => passed)
    apiResult.value = { checks, correct, error: '' }
    if (correct) recordPracticeResult(`api-${currentApi.value.id}`, 100)
  } catch {
    apiResult.value = { checks: [], correct: false, error: 'Это невалидный JSON. Проверь кавычки, запятые и скобки.' }
  }
}

function resetExercise() {
  if (mode.value === 'sql') {
    sqlQuery.value = currentSql.value.starter
    sqlResult.value = null
  } else {
    apiJson.value = currentApi.value.starter
    apiResult.value = null
  }
}
</script>

<template>
  <div class="page lab-page">
    <PageHeading eyebrow="QA LAB · ПЕСОЧНИЦА" title="QA Lab" description="Потренируй SQL-запросы и разбор API-ответов на небольших учебных наборах." />
    <div class="practice-note"><span><Wrench :size="18" aria-hidden="true" /></span><p>Здесь используются изолированные примеры. Результаты упражнений сохраняются на устройстве; XP и рейтинг не начисляются за локальную проверку.</p></div>
    <div class="lab-tabs" role="group" aria-label="Выбор лаборатории">
      <button type="button" :aria-pressed="mode === 'sql'" :class="{ 'is-active': mode === 'sql' }" @click="selectMode('sql')"><Database :size="16" aria-hidden="true" /> SQL Lab <small>{{ sqlDoneCount }}/{{ sqlExercises.length }}</small></button>
      <button type="button" :aria-pressed="mode === 'api'" :class="{ 'is-active': mode === 'api' }" @click="selectMode('api')"><Braces :size="16" aria-hidden="true" /> API Lab <small>{{ apiDoneCount }}/{{ apiExercises.length }}</small></button>
    </div>

    <section v-if="mode === 'sql'" class="lab-panel">
      <div class="lab-exercise-nav"><div><p class="eyebrow">УПРАЖНЕНИЕ {{ exerciseIndex + 1 }} ИЗ {{ sqlExercises.length }}</p><h2>{{ currentSql.title }}</h2></div><div class="lab-step-actions"><button class="icon-button" type="button" aria-label="Предыдущее упражнение" @click="exerciseIndex = (exerciseIndex + sqlExercises.length - 1) % sqlExercises.length">‹</button><button class="icon-button" type="button" aria-label="Следующее упражнение" @click="exerciseIndex = (exerciseIndex + 1) % sqlExercises.length">›</button></div></div>
      <p class="lab-instruction">{{ currentSql.instruction }}</p>
      <div v-for="table in activeTables" :key="table.name" class="lab-table-wrap"><table class="lab-table"><caption>Учебная таблица {{ table.name }}</caption><thead><tr><th v-for="column in table.columns" :key="column">{{ column }}</th></tr></thead><tbody><tr v-for="(row, index) in table.rows" :key="index"><td v-for="column in table.columns" :key="column">{{ String(row[column]) }}</td></tr></tbody></table></div>
      <label class="lab-editor-label" for="sql-query">Твой SELECT-запрос</label>
      <textarea id="sql-query" v-model="sqlQuery" class="lab-editor" rows="4" spellcheck="false" autocapitalize="off" autocomplete="off" />
      <p class="lab-hint">Безопасный SELECT поддерживает LEFT/INNER JOIN, одно условие WHERE, GROUP BY, COUNT/SUM/AVG, ORDER BY и LIMIT. Запросы, меняющие данные, запрещены.</p>
      <div class="lab-actions"><button class="button button-primary" type="button" @click="runQuery"><Play :size="15" aria-hidden="true" /> Выполнить</button><button class="button button-quiet" type="button" @click="resetExercise"><RotateCcw :size="15" aria-hidden="true" /> Сбросить</button></div>
      <div v-if="sqlResult" class="lab-result" :class="{ 'is-success': sqlResult.correct, 'is-error': !sqlResult.correct }" role="status">
        <strong>{{ sqlResult.correct ? 'Верно: набор строк и порядок совпали.' : sqlResult.error || 'Результат отличается от ожидаемого набора.' }}</strong>
        <div v-if="!sqlResult.error && sqlResult.rows.length" class="lab-table-wrap"><table class="lab-table"><thead><tr><th v-for="column in Object.keys(sqlResult.rows[0])" :key="column">{{ column }}</th></tr></thead><tbody><tr v-for="(row, index) in sqlResult.rows" :key="index"><td v-for="column in Object.keys(row)" :key="column">{{ String(row[column]) }}</td></tr></tbody></table></div>
        <p v-else-if="!sqlResult.error">Запрос вернул 0 строк.</p>
      </div>
    </section>

    <section v-else class="lab-panel">
      <div class="lab-exercise-nav"><div><p class="eyebrow">УПРАЖНЕНИЕ {{ exerciseIndex + 1 }} ИЗ {{ apiExercises.length }}</p><h2>{{ currentApi.title }}</h2></div><div class="lab-step-actions"><button class="icon-button" type="button" aria-label="Предыдущее упражнение" @click="exerciseIndex = (exerciseIndex + apiExercises.length - 1) % apiExercises.length">‹</button><button class="icon-button" type="button" aria-label="Следующее упражнение" @click="exerciseIndex = (exerciseIndex + 1) % apiExercises.length">›</button></div></div>
      <p class="lab-instruction">{{ currentApi.instruction }}</p>
      <label class="lab-editor-label" for="api-response">API response · JSON</label>
      <textarea id="api-response" v-model="apiJson" class="lab-editor" rows="10" spellcheck="false" autocapitalize="off" autocomplete="off" />
      <p class="lab-hint">Исправь ответ так, чтобы он соблюдал бизнес-инварианты и контракт API.</p>
      <div class="lab-actions"><button class="button button-primary" type="button" @click="checkApiResponse"><Check :size="15" aria-hidden="true" /> Проверить ответ</button><button class="button button-quiet" type="button" @click="resetExercise"><RotateCcw :size="15" aria-hidden="true" /> Сбросить</button></div>
      <div v-if="apiResult" class="lab-result" :class="{ 'is-success': apiResult.correct, 'is-error': !apiResult.correct }" role="status">
        <strong>{{ apiResult.correct ? 'Ответ соответствует проверяемым условиям.' : apiResult.error || 'В ответе ещё остались проблемы.' }}</strong>
        <ul v-if="apiChecks.length"><li v-for="check in apiChecks" :key="check.label" :class="{ 'is-passed': check.passed }"><Check :size="14" aria-hidden="true" /> {{ check.label }}</li></ul>
      </div>
    </section>
  </div>
</template>
