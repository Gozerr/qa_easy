<script setup>
import { useProgress } from '../composables/useProgress.js'
import AchievementCollection from '../components/AchievementCollection.vue'
import PageHeading from '../components/PageHeading.vue'
import { marathonTracks } from '../data/marathons.js'
import { Trophy, Medal, Star, Flame } from '@lucide/vue'
import { computed } from 'vue'

const { achievements, progress } = useProgress()
const season = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'UTC' }).format(new Date())
const seasonResults = computed(() => progress.seasonalResults?.[season] ?? {})
const marathonResults = computed(() => marathonTracks.map((track) => ({
  ...track,
  score: seasonResults.value[`marathon-${track.id}`]?.bestScore ?? 0,
})))
const seasonAwards = computed(() => {
  const arenaScore = seasonResults.value['arena-scenarios']?.bestScore ?? 0
  const tracksCompleted = marathonResults.value.filter(({ score }) => score >= 70).length
  return [
    { id: 'season-first', title: 'Выход на арену', detail: 'Завершить испытание сезона', progress: Number(arenaScore > 0), target: 1, icon: Trophy, color: 'peach' },
    { id: 'season-precision', title: 'Точный прицел', detail: 'Набрать 70% в QA Arena', progress: Math.min(arenaScore, 70), target: 70, icon: Medal, color: 'mint' },
    { id: 'season-champion', title: 'Знак мастера', detail: 'Набрать 90% в QA Arena', progress: Math.min(arenaScore, 90), target: 90, icon: Star, color: 'lilac' },
    ...marathonResults.value.map((track) => ({ id: `season-${track.id}`, title: track.categoryTitle, detail: 'Набрать 70% в тематическом марафоне', progress: Math.min(track.score, 70), target: 70, icon: Medal, color: 'peach' })),
    { id: 'season-triad', title: 'Три грани QA', detail: 'Набрать 70% во всех трёх марафонах', progress: tracksCompleted, target: 3, icon: Flame, color: 'mint' },
  ].map((award) => ({ ...award, earned: award.progress >= award.target, percent: Math.round(award.progress / award.target * 100) }))
})
</script>

<template>
  <div class="page achievements-page">
    <PageHeading eyebrow="ТВОЯ КОЛЛЕКЦИЯ" title="Все достижения" description="Открытые награды и цели, к которым ты сейчас идёшь." />
    <section class="season-awards" aria-labelledby="season-awards-title">
      <div class="section-heading"><div><p class="eyebrow">СЕЗОН {{ season }}</p><h2 id="season-awards-title">Награды сезона</h2></div><span class="season-awards-count">{{ seasonAwards.filter(({ earned }) => earned).length }} / {{ seasonAwards.length }}</span></div>
      <p class="season-awards-note">Личная коллекция на этом устройстве. Официальный сезонный рейтинг проверяется отдельно в Telegram.</p>
      <div class="season-awards-grid">
        <article v-for="award in seasonAwards" :key="award.id" class="season-award-card" :class="[`feature-${award.color}`, { 'is-earned': award.earned }]">
          <span class="season-award-icon"><component :is="award.icon" :size="19" aria-hidden="true" /></span>
          <strong>{{ award.title }}</strong><small>{{ award.detail }}</small>
          <span class="season-award-progress">{{ award.progress }} / {{ award.target }}{{ award.target === 70 || award.target === 90 ? '%' : '' }}</span>
          <span class="season-award-bar"><span :style="{ width: `${award.percent}%` }"></span></span>
          <span class="season-award-state">{{ award.earned ? 'Получена' : 'В процессе' }}</span>
        </article>
      </div>
    </section>
    <AchievementCollection :achievements="achievements" filterable />
  </div>
</template>
