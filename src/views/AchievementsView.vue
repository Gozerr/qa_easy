<script setup>
import { useProgress } from '../composables/useProgress.js'
import AchievementCollection from '../components/AchievementCollection.vue'
import PageHeading from '../components/PageHeading.vue'

const { achievements } = useProgress()
</script>

<template>
  <div class="page achievements-page">
    <PageHeading eyebrow="ТВОЯ КОЛЛЕКЦИЯ" title="Все достижения" description="Открытые награды и цели, к которым ты сейчас идёшь." />
    <AchievementCollection :achievements="achievements" filterable />
  </div>
</template>
