<script setup>
import { computed, ref, watch } from 'vue'
import { Medal, Zap } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { useProgress } from '../composables/useProgress.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'
import { getMarathonQuestions, marathonTracks } from '../data/marathons.js'

const { questions } = useQuestionBank()
const { progress, cloudStatus, getArenaLeaderboard, submitArenaResult, recordPracticeResult } = useProgress()
const selectedId = ref(marathonTracks[0]?.id ?? '')
const selectedTrack = computed(() => marathonTracks.find(({ id }) => id === selectedId.value) ?? marathonTracks[0])
const questionPool = computed(() => getMarathonQuestions(questions.value, selectedTrack.value?.id))
const session = computed(() => selectedTrack.value ? progress.activeSessions[selectedTrack.value.mode] ?? null : null)
const currentScore = computed(() => session.value?.answers.filter(({ correct }) => correct).length ?? 0)
const bestScore = computed(() => selectedTrack.value ? progress.practiceResults[`marathon-${selectedTrack.value.id}`]?.bestScore ?? null : null)
const leaderboard = ref(null)
const submitting = ref(false)
const loadingLeaderboard = ref(false)
const notice = ref('')
const error = ref('')
const seasonLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date())
const submittedSessions = new Set()
let leaderboardRequest = 0

function challengeId(trackId) {
  return trackId === 'scenarios' ? 'scenario-investigation' : trackId
}

async function loadLeaderboard() {
  const sequence = ++leaderboardRequest
  const currentTrack = selectedTrack.value
  leaderboard.value = null
  error.value = ''
  if (cloudStatus.value !== 'ready' || !currentTrack) return
  loadingLeaderboard.value = true
  try {
    leaderboard.value = await getArenaLeaderboard(challengeId(currentTrack.id))
  } catch {
    if (sequence === leaderboardRequest) error.value = 'Не удалось загрузить рейтинг этой темы.'
  } finally {
    if (sequence === leaderboardRequest) loadingLeaderboard.value = false
  }
}

async function saveCompletedMarathon(completed) {
  if (!completed || !session.value || !selectedTrack.value) return
  const finishedSession = session.value
  const track = selectedTrack.value
  const score = Math.round(currentScore.value * 100 / finishedSession.questionIds.length)
  recordPracticeResult(`marathon-${track.id}`, score)
  if (submittedSessions.has(finishedSession.sessionId)) return
  submittedSessions.add(finishedSession.sessionId)
  notice.value = ''
  error.value = ''
  if (cloudStatus.value !== 'ready' || !finishedSession.serverVerified) {
    notice.value = 'Локальный результат сохранён на устройстве. Для сезонного рейтинга нужна проверенная сессия Telegram.'
    return
  }
  submitting.value = true
  try {
    const result = await submitArenaResult(finishedSession.sessionId, finishedSession.answers.map(({ attemptId }) => attemptId), challengeId(track.id))
    leaderboard.value = result.leaderboard
    notice.value = result.accepted
      ? `Результат ${result.score}% принят в сезонный рейтинг темы.`
      : 'Эта попытка уже учтена в сезонном рейтинге темы.'
  } catch {
    submittedSessions.delete(finishedSession.sessionId)
    error.value = 'Ответы сохранены, но результат не отправлен. Начни новую попытку в проверенной сессии Telegram.'
  } finally {
    submitting.value = false
  }
}

watch([selectedId, cloudStatus], () => { void loadLeaderboard() }, { immediate: true })
watch(() => session.value?.completed, (completed) => {
  void saveCompletedMarathon(completed)
}, { immediate: true })
</script>

<template>
  <div class="page marathons-page">
    <PageHeading :eyebrow="`QA MARATHONS · СЕЗОН ${seasonLabel}`" title="Тематические марафоны" description="Выбери навык и пройди полный набор вопросов в своём темпе. Прогресс и лучший результат сохраняются на устройстве." />

    <section class="marathon-track-grid" aria-label="Выбор тематического марафона">
      <button
        v-for="track in marathonTracks"
        :key="track.id"
        class="marathon-track-card"
        :class="[`feature-${track.color}`, { 'is-selected': selectedId === track.id }]"
        type="button"
        :aria-pressed="selectedId === track.id"
        @click="selectedId = track.id"
      >
        <span class="marathon-track-icon" aria-hidden="true">{{ track.icon }}</span>
        <span class="marathon-track-copy"><strong>{{ track.categoryTitle }}</strong><small>{{ track.description }}</small></span>
        <span class="marathon-track-count">{{ track.size }} вопросов</span>
        <span v-if="progress.practiceResults[`marathon-${track.id}`]" class="marathon-track-best"><Medal :size="14" aria-hidden="true" /> Лучший результат {{ progress.practiceResults[`marathon-${track.id}`].bestScore }}%</span>
      </button>
    </section>

    <section v-if="selectedTrack" class="marathon-challenge-card">
      <div class="marathon-challenge-heading"><span><Zap :size="19" aria-hidden="true" /></span><div><p class="eyebrow">СЕЗОН {{ seasonLabel }}</p><h2>{{ selectedTrack.categoryTitle }}</h2></div><span class="arena-question-count">{{ questionPool.length }} вопросов</span></div>
      <p>Вопросы относятся только к выбранной теме. Ответы с разбором сохраняются в общем прогрессе; лучший процент хранится отдельно для этого марафона.</p>
      <p class="marathon-local-note">В сезонный рейтинг попадают только серверно проверенные результаты в Telegram. Локальная тренировка сохранится на этом устройстве, но не попадёт в общий зачёт.</p>
      <QuizPlayer :key="selectedTrack.mode" :mode="selectedTrack.mode" :pool="questionPool" :size="selectedTrack.size" start-label="Начать марафон" />
      <div v-if="session?.completed" class="arena-result-status" role="status">
        <span v-if="submitting" class="arena-loading">Отправляем результат…</span>
        <span v-else-if="error" class="arena-result-error">{{ error }}</span>
        <span v-else>{{ notice }}</span>
        <button v-if="error && session.serverVerified" class="button button-quiet" type="button" :disabled="submitting" @click="saveCompletedMarathon(true)">Повторить отправку</button>
      </div>
      <p v-if="session?.completed" class="arena-local-best" role="status">Результат марафона: <strong>{{ currentScore }} из {{ session.questionIds.length }} · {{ Math.round(currentScore * 100 / session.questionIds.length) }}%</strong></p>
      <p v-if="bestScore !== null" class="arena-local-best">Лучший результат по теме: <strong>{{ bestScore }}%</strong></p>
    </section>

    <section class="arena-leaderboard marathon-leaderboard" aria-labelledby="marathon-leaderboard-title">
      <div class="section-heading"><div><p class="eyebrow">{{ seasonLabel.toLocaleUpperCase('ru-RU') }}</p><h2 id="marathon-leaderboard-title">{{ selectedTrack?.categoryTitle }} · рейтинг</h2></div></div>
      <p v-if="cloudStatus !== 'ready'" class="arena-local-note">Рейтинг доступен в подтверждённой сессии Telegram и показывает только участников, включивших публичный псевдоним.</p>
      <div v-else-if="loadingLeaderboard && !leaderboard" class="arena-loading">Загружаем результаты сезона…</div>
      <p v-else-if="error && !leaderboard" class="leaderboard-error" role="alert">{{ error }}</p>
      <template v-else-if="leaderboard">
        <p class="arena-season-summary">Сезон начался {{ leaderboard.seasonStart }} · {{ leaderboard.totalParticipants }} участников</p>
        <p v-if="leaderboard.currentUserRank" class="leaderboard-your-rank">Твоя позиция: <strong>#{{ leaderboard.currentUserRank }}</strong></p>
        <div v-if="leaderboard.entries.length" class="arena-rank-list">
          <article v-for="entry in leaderboard.entries" :key="entry.rank" class="arena-rank-row" :class="{ 'is-current': entry.rank === leaderboard.currentUserRank }">
            <span class="arena-rank-number">{{ entry.rank }}</span><UserAvatar :src="entry.avatarUrl" :name="entry.displayName" class="leaderboard-avatar" />
            <span class="arena-rank-name"><strong>{{ entry.displayName }}</strong><small>{{ entry.matches }} попыток</small></span><strong class="arena-rank-score">{{ entry.bestScore }}%</strong>
          </article>
        </div>
        <p v-else class="leaderboard-empty">В этом сезоне ещё нет опубликованных результатов.</p>
      </template>
    </section>
  </div>
</template>
