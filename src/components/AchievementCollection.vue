<script setup>
import { computed, ref } from 'vue'
import { Award, BookOpen, CalendarCheck, Check, Flame, Layers, MessageCircleQuestion, Search, Sparkles, Target, Trophy, Zap } from '@lucide/vue'

const props = defineProps({
  achievements: { type: Array, required: true },
  filterable: { type: Boolean, default: false },
})

const achievementIcons = { sparkles: Sparkles, target: Target, message: MessageCircleQuestion, award: Award, book: BookOpen, layers: Layers, trophy: Trophy, calendar: CalendarCheck, flame: Flame, zap: Zap, search: Search }
const categories = computed(() => ['Все', ...new Set(props.achievements.map(({ category }) => category))])
const activeCategory = ref('Все')
const visibleAchievements = computed(() => !props.filterable || activeCategory.value === 'Все'
  ? props.achievements
  : props.achievements.filter(({ category }) => category === activeCategory.value))

function formattedDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}
</script>

<template>
  <div v-if="filterable" class="achievement-filters" role="group" aria-label="Категории достижений">
    <button v-for="category in categories" :key="category" type="button" :aria-pressed="activeCategory === category" :class="{ 'is-active': activeCategory === category }" @click="activeCategory = category">{{ category }}</button>
  </div>
  <div class="achievement-list">
    <article v-for="achievement in visibleAchievements" :key="achievement.id" class="achievement-row" :class="[{ 'is-earned': achievement.earned }, `rarity-${achievement.rarity.toLowerCase()}`]">
      <span class="achievement-icon"><Check v-if="achievement.earned" :size="18" aria-hidden="true" /><component :is="achievementIcons[achievement.icon]" v-else :size="18" aria-hidden="true" /></span>
      <div class="achievement-copy">
        <div class="achievement-title"><strong>{{ achievement.title }}</strong><span class="achievement-rarity">{{ achievement.rarity }}</span></div>
        <small>{{ achievement.description }}</small>
        <div class="achievement-progress-copy"><span>{{ achievement.earned ? `Открыто · ${formattedDate(achievement.earnedAt)}` : `${achievement.current.toLocaleString('ru-RU')} / ${achievement.target.toLocaleString('ru-RU')}` }}</span><span>{{ achievement.earned ? '100' : achievement.percent }}%</span></div>
        <div class="achievement-progress-track" role="progressbar" :aria-valuenow="achievement.earned ? 100 : achievement.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="`Прогресс: ${achievement.title}`"><span :style="{ width: `${achievement.earned ? 100 : achievement.percent}%` }" /></div>
      </div>
      <span class="achievement-status">{{ achievement.earned ? 'ОТКРЫТО' : 'ЗАКРЫТО' }}</span>
    </article>
    <p v-if="visibleAchievements.length === 0" class="achievement-empty">Пока нет открытых наград. Пройди урок или ответь на вопрос — здесь появится первая.</p>
  </div>
</template>
