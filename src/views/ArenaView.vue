<script setup>
import { computed, ref, watch } from 'vue'
import { LoaderCircle, Medal, RefreshCw, ShieldCheck, Trophy } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { useQuestionBank } from '../composables/useQuestionBank.js'
import { useProgress } from '../composables/useProgress.js'

const { questions } = useQuestionBank()
const { progress, cloudStatus, getArenaLeaderboard, submitArenaResult, recordPracticeResult } = useProgress()
const scenarioQuestions = computed(() => questions.value.filter(({ category }) => category === 'scenarios'))
const session = computed(() => progress.activeSessions.arena ?? null)
const currentScore = computed(() => session.value?.answers.filter(({ correct }) => correct).length ?? 0)
const localBest = computed(() => progress.practiceResults['arena-scenarios']?.bestScore ?? null)
const leaderboard = ref(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const notice = ref('')
const seasonLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date())
let requestSequence = 0

async function loadLeaderboard() {
  const sequence = ++requestSequence
  if (cloudStatus.value !== 'ready') {
    leaderboard.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    leaderboard.value = await getArenaLeaderboard()
  } catch {
    if (sequence === requestSequence) error.value = 'Не удалось загрузить таблицу сезона.'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

async function saveCompletedArena(completed) {
  if (!completed || !session.value) return
  const score = Math.round(currentScore.value * 100 / session.value.questionIds.length)
  recordPracticeResult('arena-scenarios', score)
  error.value = ''
  notice.value = ''
  if (cloudStatus.value !== 'ready' || !session.value.serverVerified) {
    notice.value = 'Локальный результат сохранён на устройстве. Для сезонного рейтинга нужна проверенная сессия Telegram.'
    return
  }
  submitting.value = true
  try {
    const result = await submitArenaResult(session.value.sessionId, session.value.answers.map(({ attemptId }) => attemptId))
    leaderboard.value = result.leaderboard
    notice.value = result.accepted
      ? `Результат ${result.score}% принят в сезонный рейтинг.`
      : 'Эта попытка уже учтена в сезонном рейтинге.'
  } catch {
    error.value = 'Ответы сохранены, но результат арены не отправлен. Нажми «Отправить результат» ещё раз.'
  } finally {
    submitting.value = false
  }
}

async function retryResult() {
  if (!session.value?.completed || !session.value.serverVerified || submitting.value) return
  await saveCompletedArena(true)
}

watch(cloudStatus, (status) => { if (status === 'ready') loadLeaderboard() }, { immediate: true })
watch(() => session.value?.completed, saveCompletedArena, { immediate: true })
</script>

<template>
  <div class="page arena-page">
    <PageHeading :eyebrow="`QA ARENA · СЕЗОН ${seasonLabel}`" title="QA Arena" description="Десять сценариев на внимательность и точность. Лучший подтверждённый результат попадёт в сезонную таблицу." />
    <section class="arena-challenge-card">
      <div class="arena-challenge-heading"><span><Trophy :size="19" aria-hidden="true" /></span><div><p class="eyebrow">ИСПЫТАНИЕ СЕЗОНА · {{ seasonLabel }}</p><h2>Расследование сценариев</h2></div><span class="arena-question-count">10 вопросов</span></div>
      <p>Разбери ситуации из практики тестировщика. За каждый ответ получишь разбор; в рейтинг идёт точность завершённой серии.</p>
      <div class="arena-rules"><span><ShieldCheck :size="15" aria-hidden="true" /> Ответы подтверждаются сервером в Telegram</span><span><Medal :size="15" aria-hidden="true" /> В сезонном зачёте учитывается лучший результат</span></div>
      <QuizPlayer mode="arena" :pool="scenarioQuestions" :size="10" start-label="Войти на арену" />
      <div v-if="session?.completed" class="arena-result-status" role="status">
        <LoaderCircle v-if="submitting" :size="16" class="spinner" aria-hidden="true" />
        <span v-else-if="error" class="arena-result-error">{{ error }}</span>
        <span v-else>{{ notice }}</span>
        <button v-if="error && cloudStatus === 'ready'" class="button button-quiet" type="button" @click="retryResult">Отправить результат</button>
      </div>
      <p v-if="cloudStatus !== 'ready'" class="arena-local-note">Тренироваться можно и в браузере. Локальные ответы не участвуют в рейтинге. Открой Mini App в Telegram для официального зачёта.</p>
      <p v-if="localBest !== null" class="arena-local-best">Лучший результат на этом устройстве: <strong>{{ localBest }}%</strong></p>
    </section>

    <section class="arena-leaderboard" aria-labelledby="arena-ranking-title">
      <div class="section-heading"><div><p class="eyebrow">{{ seasonLabel.toLocaleUpperCase('ru-RU') }}</p><h2 id="arena-ranking-title">Таблица сезона</h2></div><button v-if="cloudStatus === 'ready'" class="icon-button" type="button" aria-label="Обновить таблицу сезона" :disabled="loading" @click="loadLeaderboard"><RefreshCw :size="16" :class="{ spinner: loading }" aria-hidden="true" /></button></div>
      <p v-if="cloudStatus !== 'ready'" class="arena-local-note">Таблица показывает только результаты участников, которые включили показ псевдонима в рейтинге профиля.</p>
      <div v-else-if="loading && !leaderboard" class="arena-loading" role="status"><LoaderCircle :size="16" class="spinner" aria-hidden="true" /> Загружаем таблицу…</div>
      <p v-else-if="error && !leaderboard" class="leaderboard-error" role="alert">{{ error }}</p>
      <template v-else-if="leaderboard">
        <p class="arena-season-summary">Сезон начался {{ leaderboard.seasonStart }} · {{ leaderboard.totalParticipants }} участников</p>
        <p v-if="leaderboard.currentUserRank" class="leaderboard-your-rank">Твоя позиция: <strong>#{{ leaderboard.currentUserRank }}</strong></p>
        <div v-if="leaderboard.entries.length" class="arena-rank-list">
          <article v-for="entry in leaderboard.entries" :key="entry.rank" class="arena-rank-row" :class="{ 'is-current': entry.rank === leaderboard.currentUserRank }">
            <span class="arena-rank-number">{{ entry.rank }}</span>
            <UserAvatar :src="entry.avatarUrl" :name="entry.displayName" class="leaderboard-avatar" />
            <span class="arena-rank-name"><strong>{{ entry.displayName }}</strong><small>{{ entry.matches }} попыток</small></span>
            <strong class="arena-rank-score">{{ entry.bestScore }}%</strong>
          </article>
        </div>
        <p v-else class="leaderboard-empty">В этом сезоне ещё нет опубликованных результатов.</p>
      </template>
    </section>
  </div>
</template>
