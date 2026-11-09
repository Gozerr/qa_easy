<script setup>
import { RouterLink } from 'vue-router'
import { ArrowLeft, CircleHelp } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
</script>

<template>
  <div class="page not-found-page">
    <PageHeading eyebrow="404 · ТЕСТ НЕ ПРОШЁЛ" title="Такой страницы нет" description="Похоже, маршрут потерялся по дороге. С вопросами и прогрессом всё в порядке." />
    <span class="not-found-mark"><CircleHelp :size="29" aria-hidden="true" /></span>
    <RouterLink class="button button-primary" to="/"><ArrowLeft :size="16" aria-hidden="true" /> На главную</RouterLink>
  </div>
</template>