<script setup>
import { computed, ref, watch } from 'vue'
import { Crown, RefreshCw, Trophy, Zap } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import { useProgress } from '../composables/useProgress.js'
import { fetchLeaderboard, updateLeaderboardPreferences } from '../lib/cloudApi.js'

const { cloudStatus } = useProgress()
const leaderboard = ref(null)
const enabled = ref(false)
const displayName = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const canSave = computed(() => !saving.value && (!enabled.value || /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u.test(displayName.value.trim())))
const podium = computed(() => leaderboard.value?.entries.filter(({ rank }) => rank <= 3) ?? [])

function avatarLetter(name) {
  return name?.trim().slice(0, 1).toLocaleUpperCase('ru-RU') || '?'
}

function avatarTone(rank) {
  return ['gold', 'silver', 'bronze'][rank - 1] ?? 'default'
}

async function refresh() {
  if (cloudStatus.value !== 'ready') return
  loading.value = true
  error.value = ''
  try {
    leaderboard.value = await fetchLeaderboard()
    enabled.value = leaderboard.value.preferences.enabled
    displayName.value = leaderboard.value.preferences.displayName
  } catch {
    error.value = 'Не удалось загрузить рейтинг. Попробуй обновить страницу.'
  } finally {
    loading.value = false
  }
}

async function savePreferences() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const preferences = await updateLeaderboardPreferences({
      enabled: enabled.value,
      displayName: displayName.value.trim(),
    })
    enabled.value = preferences.enabled
    displayName.value = preferences.displayName
    message.value = preferences.enabled ? 'Ты участвуешь в рейтинге.' : 'Участие выключено.'
    await refresh()
  } catch {
    error.value = 'Настройки не сохранены. Проверь соединение и введи псевдоним от 2 до 24 символов.'
  } finally {
    saving.value = false
  }
}

watch(cloudStatus, (status) => {
  if (status === 'ready') refresh()
}, { immediate: true })
</script>

<template>
  <div class="page leaderboard-page">
    <PageHeading eyebrow="СЕРВЕРНЫЕ РЕЗУЛЬТАТЫ" title="Рейтинг" description="Сравнивай подтверждённые результаты с другими участниками." />

    <section v-if="cloudStatus !== 'ready'" class="leaderboard-unavailable" role="status">
      <Trophy :size="23" aria-hidden="true" />
      <div>
        <strong>Рейтинг доступен в Telegram</strong>
        <p>Открой Mini App из бота, чтобы подтвердить профиль и загрузить таблицу.</p>
      </div>
    </section>

    <template v-else>
      <form class="leaderboard-settings" @submit.prevent="savePreferences">
        <div class="leaderboard-settings-copy">
          <p class="eyebrow">ТВОЙ ВЫБОР</p>
          <h2>Участие в рейтинге</h2>
          <p>Публикуются только выбранный псевдоним и серверные очки. Telegram ID и имя профиля скрыты. Участие можно выключить в любой момент.</p>
        </div>
        <label class="leaderboard-name-field">
          <span>Псевдоним</span>
          <input v-model="displayName" type="text" autocomplete="nickname" minlength="2" maxlength="24" placeholder="Например, QA Мастер">
        </label>
        <label class="leaderboard-toggle">
          <input v-model="enabled" type="checkbox">
          <span>Показывать меня в таблице</span>
        </label>
        <div class="leaderboard-settings-actions">
          <button class="button button-primary" type="submit" :disabled="!canSave">
            {{ saving ? 'Сохраняем…' : 'Сохранить' }}
          </button>
          <span v-if="message" class="leaderboard-message" role="status">{{ message }}</span>
        </div>
      </form>

      <section v-if="podium.length" class="leaderboard-arena" aria-label="Лидеры недели">
        <div class="leaderboard-arena-heading"><span><Crown :size="17" aria-hidden="true" /> ЗАЛ СЛАВЫ</span><span>СЕЗОН 01</span></div>
        <div class="podium">
          <article v-for="entry in podium" :key="entry.rank" class="podium-player" :class="`podium-${entry.rank}`">
            <span class="podium-crown" v-if="entry.rank === 1"><Crown :size="19" aria-hidden="true" /></span>
            <span class="leaderboard-avatar" :class="`avatar-${avatarTone(entry.rank)}`">{{ avatarLetter(entry.displayName) }}</span>
            <strong>{{ entry.displayName }}</strong><small><Zap :size="12" aria-hidden="true" /> {{ entry.xp }} XP</small>
            <span class="podium-step">{{ entry.rank }}</span>
          </article>
        </div>
        <p v-if="leaderboard?.currentUserRank" class="leaderboard-arena-rank">Твой рекорд: <strong>#{{ leaderboard.currentUserRank }}</strong> из {{ leaderboard.totalParticipants }}</p>
      </section>

      <div class="leaderboard-table-heading">
        <div>
          <p class="eyebrow">ТОП УЧАСТНИКОВ</p>
          <h2>{{ leaderboard?.totalParticipants ?? 0 }} в рейтинге</h2>
        </div>
        <button class="icon-button" type="button" aria-label="Обновить рейтинг" title="Обновить рейтинг" :disabled="loading" @click="refresh">
          <RefreshCw :size="17" :class="{ spinner: loading }" aria-hidden="true" />
        </button>
      </div>

      <p v-if="error" class="leaderboard-error" role="alert">{{ error }}</p>
      <p v-if="leaderboard?.currentUserRank && leaderboard.currentUserRank > 50" class="leaderboard-your-rank" role="status">
        Твоё место: <strong>#{{ leaderboard.currentUserRank }}</strong>
      </p>
      <div v-if="loading && !leaderboard" class="leaderboard-loading" role="status">Загружаем рейтинг…</div>
      <p v-else-if="leaderboard && leaderboard.entries.length === 0" class="leaderboard-empty">
        Пока никто не включил участие. Стань первым участником.
      </p>
      <div v-else-if="leaderboard" class="leaderboard-game-list">
        <article v-for="entry in leaderboard.entries" :key="entry.rank" class="leaderboard-player" :class="{ 'is-current': entry.rank === leaderboard.currentUserRank }">
          <strong class="leaderboard-rank">{{ entry.rank }}</strong>
          <span class="leaderboard-avatar" :class="`avatar-${avatarTone(entry.rank)}`">{{ avatarLetter(entry.displayName) }}</span>
          <span class="leaderboard-player-name"><strong>{{ entry.displayName }}</strong><small>{{ entry.accuracy }}% точность</small></span>
          <span class="leaderboard-score"><strong>{{ entry.xp }}</strong><small>XP</small></span>
        </article>
      </div>
    </template>
  </div>
</template>
