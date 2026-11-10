<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Award, ChevronRight, Flame, RotateCcw, Sparkles, Trophy } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import AchievementCollection from '../components/AchievementCollection.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { useProgress } from '../composables/useProgress.js'
import { fetchAiAdminStatus, fetchLeaderboardPreferences, updateLeaderboardPreferences } from '../lib/cloudApi.js'

const { progress, accuracy, currentStreak, achievements, cloudProfile, cloudStatus, clearProgress, setTheme } = useProgress()
const isAiAdmin = ref(false)

async function checkAiAdmin() {
  isAiAdmin.value = false
  if (cloudStatus.value !== 'ready') return
  try {
    isAiAdmin.value = (await fetchAiAdminStatus()).authorized
  } catch {
    isAiAdmin.value = false
  }
}

const confirmingReset = ref(false)
const resetting = ref(false)
const resetError = ref('')
const resetTrigger = ref(null)
const cancelResetButton = ref(null)
const earnedAchievements = computed(() => achievements.value.filter(({ earned }) => earned).length)
const recentAchievements = computed(() => achievements.value
  .filter(({ earned }) => earned)
  .sort((a, b) => Date.parse(b.earnedAt ?? 0) - Date.parse(a.earnedAt ?? 0))
  .slice(0, 5))
const displayName = computed(() => cloudProfile.value?.firstName || 'QA-исследователь')
const level = computed(() => Math.floor(progress.xp / 100) + 1)
const levelProgress = computed(() => progress.xp % 100)
const leaderboardEnabled = ref(false)
const leaderboardName = ref('')
const leaderboardLoading = ref(false)
const leaderboardSaving = ref(false)
const leaderboardNotice = ref('')
const leaderboardError = ref('')
const canSaveLeaderboard = computed(() => !leaderboardSaving.value && (!leaderboardEnabled.value || /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,23}$/u.test(leaderboardName.value.trim())))

watch(confirmingReset, async (open) => {
  await nextTick()
  if (open) cancelResetButton.value?.focus()
  else resetTrigger.value?.focus()
})
watch(cloudStatus, checkAiAdmin, { immediate: true })

async function loadLeaderboardPreferences() {
  if (cloudStatus.value !== 'ready') return
  leaderboardLoading.value = true
  leaderboardError.value = ''
  try {
    const preferences = await fetchLeaderboardPreferences()
    leaderboardEnabled.value = preferences.enabled
    leaderboardName.value = preferences.displayName
  } catch {
    leaderboardError.value = 'Не удалось загрузить настройки рейтинга.'
  } finally {
    leaderboardLoading.value = false
  }
}

async function saveLeaderboardPreferences() {
  if (!canSaveLeaderboard.value) return
  leaderboardSaving.value = true
  leaderboardError.value = ''
  leaderboardNotice.value = ''
  try {
    const preferences = await updateLeaderboardPreferences({ enabled: leaderboardEnabled.value, displayName: leaderboardName.value.trim() })
    leaderboardEnabled.value = preferences.enabled
    leaderboardName.value = preferences.displayName
    leaderboardNotice.value = preferences.enabled ? 'Ты участвуешь в рейтинге.' : 'Твоё участие выключено.'
  } catch {
    leaderboardError.value = 'Не удалось сохранить настройки. Проверь соединение и псевдоним.'
  } finally {
    leaderboardSaving.value = false
  }
}

watch(cloudStatus, (status) => { if (status === 'ready') loadLeaderboardPreferences() }, { immediate: true })

function openResetDialog(event) {
  resetError.value = ''
  resetTrigger.value = event.currentTarget
  confirmingReset.value = true
}

function handleDialogKeydown(event) {
  if (event.key === 'Escape' && !resetting.value) {
    event.preventDefault()
    confirmingReset.value = false
    return
  }
  if (event.key !== 'Tab') return

  const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
  if (buttons.length === 0) return
  const first = buttons[0]
  const last = buttons[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

async function reset() {
  resetting.value = true
  resetError.value = ''
  try {
    await clearProgress()
    confirmingReset.value = false
  } catch {
    resetError.value = 'Не удалось сбросить облачный прогресс. Проверьте соединение и повторите попытку.'
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeading eyebrow="ТВОЙ ПУТЬ В QA" title="Профиль" description="Тут живут ответы, достижения и маленькие победы." />

    <section class="profile-scoreboard" aria-label="Статистика">
      <div class="scoreboard-head"><UserAvatar :src="cloudProfile?.avatarUrl" :name="displayName" size="profile-avatar" /><span><strong>{{ displayName }}</strong><small>{{ cloudProfile?.username ? `@${cloudProfile.username}` : `Уровень ${level}` }}</small></span><span class="xp-mark"><Sparkles :size="14" aria-hidden="true" /> {{ progress.xp }} XP</span></div>
      <p class="profile-trust-note">{{ cloudStatus === 'ready' ? 'Статистика подтверждена сервером' : 'Локальная статистика · хранится на этом устройстве и может быть изменена в браузере' }}</p>
      <div class="scoreboard-grid">
        <div><strong>{{ progress.answeredCount }}</strong><span>ответов дано</span></div>
        <div><strong>{{ accuracy }}<small>%</small></strong><span>точность ответов</span></div>
        <div><strong>{{ currentStreak }} <small><Flame :size="16" aria-hidden="true" /></small></strong><span>дней подряд</span></div>
      </div>
      <div class="profile-daily-count"><Trophy :size="16" aria-hidden="true" /> QA Daily выполнено <strong>{{ progress.dailyCompletions.length }}</strong></div>
      <div class="profile-level-progress"><div><strong>Уровень {{ level }}</strong><span>{{ 100 - levelProgress }} XP до следующего</span></div><div class="progress-track" role="progressbar" :aria-valuenow="levelProgress" aria-valuemin="0" aria-valuemax="100" aria-label="Прогресс до следующего уровня"><span :style="{ width: `${levelProgress}%` }" /></div></div>
    </section>

    <section class="profile-section">
      <div class="section-heading">
        <div><p class="eyebrow">{{ Math.min(5, earnedAchievements) }} ПОСЛЕДНИХ ИЗ {{ earnedAchievements }} ОТКРЫТО</p><h2>Достижения</h2></div>
        <RouterLink class="text-link" to="/achievements">Все {{ achievements.length }} <ChevronRight :size="16" aria-hidden="true" /></RouterLink>
      </div>
      <AchievementCollection :achievements="recentAchievements" />
    </section>

    <section class="profile-section settings-section">
      <div class="section-heading"><div><p class="eyebrow">НАСТРОЙКИ</p><h2>Вид приложения</h2></div></div>
      <div class="theme-options" role="group" aria-label="Цветовая тема">
        <button type="button" :aria-pressed="progress.theme === 'system'" :class="{ 'is-active': progress.theme === 'system' }" @click="setTheme('system')">Системная</button>
        <button type="button" :aria-pressed="progress.theme === 'light'" :class="{ 'is-active': progress.theme === 'light' }" @click="setTheme('light')">Светлая</button>
        <button type="button" :aria-pressed="progress.theme === 'dark'" :class="{ 'is-active': progress.theme === 'dark' }" @click="setTheme('dark')">Тёмная</button>
      </div>
      <RouterLink v-if="isAiAdmin" class="button button-quiet ai-admin-link" to="/admin/ai"><Sparkles :size="16" aria-hidden="true" /> AI-черновики</RouterLink>
    </section>

    <section class="profile-section settings-section">
      <div class="section-heading"><div><p class="eyebrow">ПРОФИЛЬ И ПРИВАТНОСТЬ</p><h2>Участие в рейтинге</h2></div><Trophy :size="20" aria-hidden="true" /></div>
      <p class="profile-setting-description">В таблице видны выбранный псевдоним, аватар Telegram и подтверждённые очки. Telegram ID и имя профиля скрыты.</p>
      <form class="profile-leaderboard-settings" @submit.prevent="saveLeaderboardPreferences">
        <label class="leaderboard-name-field"><span>Псевдоним</span><input v-model="leaderboardName" type="text" autocomplete="nickname" minlength="2" maxlength="24" placeholder="Например, QA Мастер" :disabled="cloudStatus !== 'ready' || leaderboardLoading"></label>
        <label class="leaderboard-toggle"><input v-model="leaderboardEnabled" type="checkbox" :disabled="cloudStatus !== 'ready' || leaderboardLoading"><span>Показывать меня в рейтинге</span></label>
        <button class="button button-primary" type="submit" :disabled="cloudStatus !== 'ready' || leaderboardLoading || !canSaveLeaderboard">{{ leaderboardLoading ? 'Загружаем…' : leaderboardSaving ? 'Сохраняем…' : 'Сохранить настройки' }}</button>
      </form>
      <p v-if="cloudStatus !== 'ready'" class="profile-setting-description">Открой приложение в Telegram, чтобы управлять участием.</p>
      <p v-if="leaderboardNotice" class="leaderboard-message" role="status">{{ leaderboardNotice }}</p>
      <p v-if="leaderboardError" class="leaderboard-error" role="alert">{{ leaderboardError }}</p>
    </section>

    <section class="reset-section">
      <div><h2>Начать сначала</h2><p>Удалить очки, ответы и текущие тренировки из активного хранилища.</p></div>
      <button class="button button-danger" type="button" @click="openResetDialog"><RotateCcw :size="16" aria-hidden="true" /> Сбросить</button>
    </section>

    <div v-if="confirmingReset" class="modal-backdrop" role="presentation" @click.self="confirmingReset = false">
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title" @keydown="handleDialogKeydown">
        <span class="dialog-icon"><RotateCcw :size="21" aria-hidden="true" /></span>
        <h2 id="reset-title">Удалить весь прогресс?</h2>
        <p>Ответы, очки, серия и тренировки будут удалены из активного хранилища. Вернуть их не получится.</p>
        <p v-if="resetError" class="reset-error" role="alert">{{ resetError }}</p>
        <div class="dialog-actions">
          <button ref="cancelResetButton" class="button button-quiet" type="button" :disabled="resetting" @click="confirmingReset = false">Оставить как есть</button>
          <button class="button button-danger" type="button" :disabled="resetting" @click="reset">{{ resetting ? 'Удаляем…' : 'Удалить прогресс' }}</button>
        </div>
      </section>
    </div>
  </div>
</template>
