<script setup>
import { computed, ref, watch } from 'vue'
import { CalendarDays, Check, Flame, LoaderCircle, Sparkles, Trophy } from '@lucide/vue'
import { useProgress } from '../composables/useProgress.js'

const props = defineProps({ today: { type: String, required: true } })
const { progress, cloudStatus, getWeeklyMissions, claimWeeklyMission } = useProgress()
const missions = ref([])
const loading = ref(false)
const claimingId = ref('')
const error = ref('')
const notice = ref('')

function weekMonday(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date.toISOString().slice(0, 10)
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const weekStart = computed(() => weekMonday(props.today))
const weekEnd = computed(() => addDays(weekStart.value, 6))
const weekLabel = computed(() => {
  const start = new Date(`${weekStart.value}T00:00:00Z`)
  const end = new Date(`${weekEnd.value}T00:00:00Z`)
  const format = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${format.format(start)} — ${format.format(end)} · UTC`
})
const calendarDays = computed(() => Array.from({ length: 7 }, (_, index) => {
  const date = addDays(weekStart.value, index)
  return {
    date,
    day: new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)).replace('.', ''),
    number: Number(date.slice(-2)),
    completed: progress.dailyCompletions.includes(date),
    today: date === props.today,
  }
}))

async function loadMissions() {
  missions.value = []
  error.value = ''
  if (cloudStatus.value !== 'ready') return
  loading.value = true
  try {
    const data = await getWeeklyMissions(weekStart.value)
    missions.value = data?.missions ?? []
  } catch {
    error.value = 'Не удалось загрузить миссии. Проверь соединение и обнови список.'
  } finally {
    loading.value = false
  }
}

async function claim(mission) {
  if (!mission.eligible || mission.claimed || claimingId.value) return
  claimingId.value = mission.id
  error.value = ''
  notice.value = ''
  try {
    const result = await claimWeeklyMission(mission.id, weekStart.value)
    notice.value = result.alreadyClaimed ? 'Эта награда уже была получена.' : `Награда получена: +${result.rewardXp} XP.`
    await loadMissions()
  } catch {
    error.value = 'Не удалось получить награду. Условие проверяется сервером; попробуй ещё раз.'
  } finally {
    claimingId.value = ''
  }
}

watch([weekStart, cloudStatus], loadMissions, { immediate: true })
</script>

<template>
  <section class="weekly-missions" aria-labelledby="weekly-missions-title">
    <div class="weekly-missions-heading"><div><p class="eyebrow">НЕДЕЛЬНЫЙ ЧЕЛЛЕНДЖ</p><h2 id="weekly-missions-title">Миссии недели</h2><small>{{ weekLabel }}</small></div><span class="weekly-trophy"><Trophy :size="18" aria-hidden="true" /></span></div>

    <div class="activity-calendar" aria-label="Календарь выполненных QA Daily за эту неделю">
      <div v-for="day in calendarDays" :key="day.date" class="activity-calendar-day" :class="{ 'is-complete': day.completed, 'is-today': day.today }" :aria-label="`${day.day} ${day.number}: ${day.completed ? 'выполнено' : 'не выполнено'}`">
        <small>{{ day.day }}</small><span><Check v-if="day.completed" :size="15" aria-hidden="true" /><template v-else>{{ day.number }}</template></span>
      </div>
    </div>

    <p v-if="cloudStatus !== 'ready'" class="weekly-missions-gate"><Sparkles :size="15" aria-hidden="true" /> Календарь сохраняется на устройстве. Недельные миссии и XP-награды доступны в подтверждённой сессии Telegram.</p>
    <div v-else-if="loading" class="weekly-missions-loading" role="status"><LoaderCircle :size="16" class="spinner" aria-hidden="true" /> Загружаем условия и прогресс с сервера…</div>
    <div v-else class="weekly-mission-list">
      <article v-for="mission in missions" :key="mission.id" class="weekly-mission" :class="{ 'is-claimed': mission.claimed }">
        <div class="weekly-mission-copy"><strong>{{ mission.title }}</strong><small>{{ mission.description }}</small></div>
        <div class="weekly-mission-progress"><span>{{ mission.progress }} / {{ mission.target }}</span><span>{{ mission.rewardXp }} XP</span></div>
        <div class="achievement-progress-track" role="progressbar" :aria-valuenow="Math.min(100, Math.round(mission.progress / mission.target * 100))" aria-valuemin="0" aria-valuemax="100" :aria-label="`Прогресс: ${mission.title}`"><span :style="{ width: `${Math.min(100, Math.round(mission.progress / mission.target * 100))}%` }" /></div>
        <button v-if="mission.claimed" class="weekly-claim-button is-claimed" type="button" disabled><Check :size="14" aria-hidden="true" /> Получено</button>
        <button v-else-if="mission.eligible" class="weekly-claim-button" type="button" :disabled="Boolean(claimingId)" @click="claim(mission)"><LoaderCircle v-if="claimingId === mission.id" :size="14" class="spinner" aria-hidden="true" /><Flame v-else :size="14" aria-hidden="true" /> Забрать {{ mission.rewardXp }} XP</button>
        <span v-else class="weekly-mission-reminder">Продолжай в своём темпе</span>
      </article>
    </div>
    <p v-if="notice" class="weekly-mission-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="weekly-mission-error" role="alert">{{ error }}</p>
  </section>
</template>
