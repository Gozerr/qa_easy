<script setup>
import { RouterLink, useRoute } from 'vue-router'
import { BookOpen, Bug, House, MessageCircleQuestion, Trophy, UserRound } from '@lucide/vue'

const route = useRoute()
const items = [
  { to: '/', label: 'Главная', icon: House },
  { to: '/theory', label: 'Теория', icon: BookOpen },
  { to: '/practice', label: 'Багуля', icon: Bug },
  { to: '/interview', label: 'Интервью', icon: MessageCircleQuestion },
  { to: '/leaderboard', label: 'Рейтинг', icon: Trophy },
  { to: '/profile', label: 'Профиль', icon: UserRound },
]
</script>

<template>
  <nav class="bottom-nav" aria-label="Основная навигация">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="nav-item"
      :class="{ 'is-active': route.path === item.to }"
      :aria-current="route.path === item.to ? 'page' : undefined"
    >
      <component :is="item.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>