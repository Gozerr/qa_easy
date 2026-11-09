<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Award, Check, Flame, RotateCcw, ShieldCheck, Sparkles, Target, Trophy } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import { useProgress } from '../composables/useProgress.js'
import { fetchAiAdminStatus } from '../lib/cloudApi.js'

const { progress, accuracy, currentStreak, achievements, cloudStatus, clearProgress, setTheme } = useProgress()
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

watch(confirmingReset, async (open) => {
  await nextTick()
  if (open) cancelResetButton.value?.focus()
  else resetTrigger.value?.focus()
})
watch(cloudStatus, checkAiAdmin, { immediate: true })

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
      <div class="scoreboard-head"><span class="profile-avatar"><ShieldCheck :size="25" aria-hidden="true" /></span><span><strong>QA-исследователь</strong><small>Учимся на каждом сценарии</small></span><span class="xp-mark"><Sparkles :size="14" aria-hidden="true" /> {{ progress.xp }} XP</span></div>
      <p class="profile-trust-note">{{ cloudStatus === 'ready' ? 'Статистика подтверждена сервером' : 'Локальная статистика · хранится на этом устройстве и может быть изменена в браузере' }}</p>
      <div class="scoreboard-grid">
        <div><strong>{{ progress.completedQuestionIds.length }}</strong><span>вопросов завершено</span></div>
        <div><strong>{{ accuracy }}<small>%</small></strong><span>точность ответов</span></div>
        <div><strong>{{ currentStreak }} <small><Flame :size="16" aria-hidden="true" /></small></strong><span>дней подряд</span></div>
      </div>
      <div class="profile-daily-count"><Trophy :size="16" aria-hidden="true" /> QA Daily выполнено <strong>{{ progress.dailyCompletions.length }}</strong></div>
    </section>

    <section class="profile-section">
      <div class="section-heading"><div><p class="eyebrow">{{ earnedAchievements }} ИЗ {{ achievements.length }} ОТКРЫТО</p><h2>Достижения</h2></div><Award :size="20" aria-hidden="true" /></div>
      <div class="achievement-list">
        <div v-for="achievement in achievements" :key="achievement.id" class="achievement-row" :class="{ 'is-earned': achievement.earned }">
          <span class="achievement-icon"><Check v-if="achievement.earned" :size="18" aria-hidden="true" /><Target v-else :size="18" aria-hidden="true" /></span>
          <span><strong>{{ achievement.title }}</strong><small>{{ achievement.description }}</small></span>
          <span class="achievement-status">{{ achievement.earned ? 'ОТКРЫТО' : 'ВПЕРЕДИ' }}</span>
        </div>
      </div>
    </section>

    <section class="profile-section settings-section">
      <div class="section-heading"><div><p class="eyebrow">НАСТРОЙКИ</p><h2>Вид приложения</h2></div></div>
      <div class="theme-options" role="group" aria-label="Цветовая тема">
        <button type="button" :aria-pressed="progress.theme === 'system'" :class="{ 'is-active': progress.theme === 'system' }" @click="setTheme('system')">Как в Telegram</button>
        <button type="button" :aria-pressed="progress.theme === 'light'" :class="{ 'is-active': progress.theme === 'light' }" @click="setTheme('light')">Светлая</button>
        <button type="button" :aria-pressed="progress.theme === 'dark'" :class="{ 'is-active': progress.theme === 'dark' }" @click="setTheme('dark')">Тёмная</button>
      </div>
      <RouterLink v-if="isAiAdmin" class="button button-quiet ai-admin-link" to="/admin/ai"><Sparkles :size="16" aria-hidden="true" /> AI-черновики</RouterLink>
    </section>

    <section class="reset-section">
      <div><h2>Начать сначала</h2><p>Удалить локальный прогресс и текущие тренировки на этом устройстве.</p></div>
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