<script setup>
import { computed, onMounted, ref } from 'vue'
import { Check, CircleAlert, LoaderCircle, RefreshCw, Sparkles, Upload } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import { fetchAiAdminStatus, fetchAiDrafts, generateAiDraft, publishAiDraft } from '../lib/cloudApi.js'

const status = ref('loading')
const enabled = ref(false)
const drafts = ref([])
const topic = ref('')
const category = ref('fundamentals')
const difficulty = ref('Средний')
const loading = ref(false)
const publishingId = ref('')
const error = ref('')
const notice = ref('')
const canGenerate = computed(() => enabled.value && !loading.value && topic.value.trim().length >= 3)

async function refresh() {
  error.value = ''
  const access = await fetchAiAdminStatus()
  if (!access.authorized) {
    status.value = 'denied'
    enabled.value = false
    return
  }
  status.value = 'ready'
  enabled.value = access.enabled
  if (enabled.value) drafts.value = await fetchAiDrafts()
}

async function initialize() {
  try {
    await refresh()
  } catch {
    status.value = 'error'
    error.value = 'Не удалось проверить доступ. Откройте приложение из подтверждённой сессии Telegram.'
  }
}

async function generate() {
  if (!canGenerate.value) return
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const draft = await generateAiDraft({ topic: topic.value.trim(), category: category.value, difficulty: difficulty.value })
    drafts.value = [draft, ...drafts.value.filter(({ id }) => id !== draft.id)]
    topic.value = ''
    notice.value = draft.status === 'approved'
      ? 'Проверка пройдена. Черновик ожидает ручной публикации.'
      : 'Независимая проверка не одобрила вопрос. Он сохранён как отклонённый черновик.'
  } catch {
    error.value = 'Генерация или независимая проверка не завершилась. Опубликованный контент не изменён.'
  } finally {
    loading.value = false
  }
}

async function publish(draft) {
  publishingId.value = draft.id
  error.value = ''
  notice.value = ''
  try {
    const questionId = await publishAiDraft(draft.id)
    draft.status = 'published'
    draft.publishedQuestionId = questionId
    notice.value = 'Вопрос опубликован и добавлен в облачный банк.'
  } catch {
    error.value = 'Публикация не выполнена. Проверьте статус черновика и повторите обновление списка.'
  } finally {
    publishingId.value = ''
  }
}

function statusLabel(value) {
  return ({ generating: 'Генерируется', approved: 'Проверен', rejected: 'Отклонён', failed: 'Ошибка', published: 'Опубликован' })[value] ?? 'Неизвестный статус'
}

onMounted(initialize)
</script>

<template>
  <div class="page ai-admin-page">
    <PageHeading eyebrow="УПРАВЛЕНИЕ КОНТЕНТОМ" title="AI-черновики" description="Каждый вопрос проходит независимую проверку и ждёт ручной публикации." />

    <div v-if="status === 'loading'" class="ai-admin-state" role="status"><LoaderCircle :size="18" class="spinner" /> Проверяем доступ…</div>
    <div v-else-if="status === 'denied'" class="ai-admin-state" role="status"><CircleAlert :size="18" /> Раздел доступен только администраторам.</div>
    <div v-else-if="status === 'error'" class="ai-admin-state" role="alert">{{ error }}</div>
    <template v-else>
      <div v-if="!enabled" class="notice notice-warning" role="status">AI gateway не настроен. Проверьте серверные секреты OpenRouter и TELEGRAM_ADMIN_IDS.</div>
      <form class="ai-generate-form" @submit.prevent="generate">
        <label class="ai-topic-field">Тема вопроса
          <input v-model="topic" maxlength="300" minlength="3" required placeholder="Например: идемпотентность HTTP-запросов" :disabled="!enabled || loading">
        </label>
        <div class="ai-form-options">
          <label>Категория
            <select v-model="category" :disabled="!enabled || loading">
              <option value="fundamentals">Основы QA</option>
              <option value="web-api">Web и API</option>
              <option value="scenarios">Практические сценарии</option>
            </select>
          </label>
          <label>Сложность
            <select v-model="difficulty" :disabled="!enabled || loading">
              <option>Начальный</option><option>Средний</option><option>Сложный</option>
            </select>
          </label>
          <button class="button button-primary ai-submit" type="submit" :disabled="!canGenerate">
            <LoaderCircle v-if="loading" :size="16" class="spinner" aria-hidden="true" />
            <Sparkles v-else :size="16" aria-hidden="true" />
            {{ loading ? 'Проверяем…' : 'Создать черновик' }}
          </button>
        </div>
      </form>

      <p v-if="error" class="ai-admin-message is-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="ai-admin-message" role="status">{{ notice }}</p>

      <section class="ai-drafts-section" aria-labelledby="ai-drafts-title">
        <div class="ai-section-heading"><h2 id="ai-drafts-title">Черновики</h2><button class="icon-button" type="button" aria-label="Обновить черновики" title="Обновить" @click="initialize"><RefreshCw :size="17" /></button></div>
        <p v-if="drafts.length === 0" class="ai-empty-state">Черновиков пока нет.</p>
        <article v-for="draft in drafts" :key="draft.id" class="ai-draft-row">
          <div class="ai-draft-meta"><span class="ai-status" :class="`status-${draft.status}`">{{ statusLabel(draft.status) }}</span><span>{{ draft.category }} · {{ draft.difficulty }}</span><span v-if="draft.revisionCount">Правок: {{ draft.revisionCount }}</span></div>
          <p class="ai-draft-topic">{{ draft.topic }}</p>
          <template v-if="draft.content">
            <h3>{{ draft.content.question }}</h3>
            <ol class="ai-options"><li v-for="option in draft.content.options" :key="option.id" :class="{ 'is-correct': option.id === draft.content.correctOptionId }">{{ option.text }}<Check v-if="option.id === draft.content.correctOptionId" :size="15" aria-label="Ответ модели" /></li></ol>
            <p class="ai-explanation">{{ draft.content.explanation }}</p>
            <div v-if="draft.review" class="ai-review-result" :class="{ 'is-approved': draft.review.approved && draft.review.correctOptionId === draft.content.correctOptionId }">
              <strong>Nemotron: {{ draft.review.approved && draft.review.correctOptionId === draft.content.correctOptionId ? 'одобрено' : 'не одобрено' }}</strong>
              <p>{{ draft.review.rationale }}</p>
              <ul v-if="draft.review.issues.length"><li v-for="issue in draft.review.issues" :key="issue">{{ issue }}</li></ul>
            </div>
          </template>
          <p v-if="draft.failureCode" class="ai-failure-code">Ошибка обработки: {{ draft.failureCode }}</p>
          <div class="ai-draft-actions">
            <span class="ai-model-label">{{ draft.generatorModel || 'Gemma 4 31B' }} · {{ draft.reviewerModel || 'Nemotron 3.5' }}</span>
            <button v-if="draft.status === 'approved'" class="button button-primary" type="button" :disabled="publishingId === draft.id" @click="publish(draft)">
              <LoaderCircle v-if="publishingId === draft.id" :size="15" class="spinner" aria-hidden="true" />
              <Upload v-else :size="15" aria-hidden="true" />
              {{ publishingId === draft.id ? 'Публикуем…' : 'Опубликовать' }}
            </button>
            <span v-else-if="draft.status === 'published'" class="ai-published-id">{{ draft.publishedQuestionId }}</span>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>
