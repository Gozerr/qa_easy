<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowUpRight, LoaderCircle, Sparkles } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import { useProgress } from '../composables/useProgress.js'

const { progress, cloudStatus, getXpHistory } = useProgress()
const transactions = ref([])
const loading = ref(false)
const error = ref('')
const totalShown = computed(() => transactions.value.reduce((total, transaction) => total + transaction.amount, 0))
let requestSequence = 0

async function loadHistory(status = cloudStatus.value) {
  const sequence = ++requestSequence
  error.value = ''
  if (status !== 'ready') {
    transactions.value = [...progress.xpTransactions].reverse()
    return
  }
  loading.value = true
  try {
    const result = await getXpHistory(100)
    if (sequence === requestSequence) transactions.value = result
  } catch {
    if (sequence === requestSequence) {
      transactions.value = []
      error.value = 'Не удалось загрузить подтверждённую историю. Проверь соединение и повтори попытку.'
    }
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

watch(cloudStatus, loadHistory, { immediate: true })

function formatDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Дата не указана'
}
</script>

<template>
  <div class="page xp-history-page">
    <PageHeading eyebrow="ПРОГРЕСС · XP" title="Опыт и награды" description="История начислений помогает видеть, какие занятия двигают тебя вперёд." />
    <section class="xp-history-summary">
      <span class="xp-history-icon"><Sparkles :size="20" aria-hidden="true" /></span>
      <div><strong>{{ progress.xp }} XP</strong><small>{{ cloudStatus === 'ready' ? 'Текущий опыт подтверждён сервером' : 'Локальный опыт на этом устройстве' }}</small></div>
      <span class="xp-history-period">{{ totalShown }} XP в списке</span>
    </section>
    <p v-if="cloudStatus !== 'ready'" class="practice-note"><span><Sparkles :size="16" aria-hidden="true" /></span><span>Локальная история хранится только на этом устройстве. В Telegram показывается подтверждённая сервером история.</span></p>
    <div v-if="loading" class="xp-history-state" role="status"><LoaderCircle :size="17" class="spinner" aria-hidden="true" /> Загружаем историю…</div>
    <p v-else-if="error" class="xp-history-error" role="alert">{{ error }} <button class="text-link" type="button" @click="loadHistory()">Повторить</button></p>
    <section v-else-if="transactions.length" class="xp-history-list" aria-label="История начисления XP">
      <article v-for="transaction in transactions" :key="transaction.id" class="xp-history-item">
        <span class="xp-history-item-icon"><ArrowUpRight :size="16" aria-hidden="true" /></span>
        <div class="xp-history-item-copy"><strong>{{ transaction.title }}</strong><small>{{ transaction.source === 'weekly-mission' ? 'Недельная миссия' : 'Ответ на вопрос' }} · {{ formatDate(transaction.createdAt) }}</small></div>
        <strong class="xp-history-amount">+{{ transaction.amount }} XP</strong>
      </article>
    </section>
    <section v-else class="xp-history-empty"><Sparkles :size="21" aria-hidden="true" /><h2>Пока нет начислений</h2><p>Ответь на вопрос в тренировке, чтобы первая запись появилась здесь.</p></section>
  </div>
</template>
