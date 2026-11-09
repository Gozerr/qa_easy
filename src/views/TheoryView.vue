<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BookOpen, ChevronDown, Clock3 } from '@lucide/vue'
import PageHeading from '../components/PageHeading.vue'
import QuizPlayer from '../components/QuizPlayer.vue'
import { theoryTopics } from '../data/theory.js'
import { useQuestionBank } from '../composables/useQuestionBank.js'

const categories = ['Все темы', ...new Set(theoryTopics.map(({ category }) => category))]
const route = useRoute()
const { getQuestion } = useQuestionBank()
const activeCategory = ref(categories.includes(route.query.category) ? route.query.category : 'Все темы')
const visibleTopics = computed(() => activeCategory.value === 'Все темы'
  ? theoryTopics
  : theoryTopics.filter(({ category }) => category === activeCategory.value))

watch(() => route.query.category, (category) => {
  activeCategory.value = categories.includes(category) ? category : 'Все темы'
})

function questionById(id) {
  return getQuestion(id)
}
</script>

<template>
  <div class="page">
    <PageHeading eyebrow="ТЕОРИЯ · 5 ТЕМ" title="Сначала понять" description="Короткие заметки о том, что помогает тестировать осмысленно. С примерами, а не зубрёжкой." />

    <div class="filter-tabs" role="group" aria-label="Фильтр тем">
      <button v-for="category in categories" :key="category" type="button" :aria-pressed="activeCategory === category" :class="{ 'is-active': activeCategory === category }" @click="activeCategory = category">
        {{ category }}
      </button>
    </div>

    <div class="theory-list">
      <details v-for="(topic, index) in visibleTopics" :key="topic.id" class="theory-topic" :open="index === 0">
        <summary>
          <span class="theory-number">{{ String(theoryTopics.indexOf(topic) + 1).padStart(2, '0') }}</span>
          <span class="theory-summary-copy"><span class="eyebrow">{{ topic.category }}</span><strong>{{ topic.title }}</strong><small>{{ topic.summary }}</small></span>
          <span class="theory-meta"><Clock3 :size="14" aria-hidden="true" /> {{ topic.time }} <ChevronDown :size="17" aria-hidden="true" /></span>
        </summary>
        <div class="theory-body">
          <article v-for="lesson in topic.lessons" :key="lesson.heading" class="lesson-block">
            <h3>{{ lesson.heading }}</h3>
            <p>{{ lesson.text }}</p>
          </article>
          <div class="knowledge-check">
            <div class="knowledge-label"><BookOpen :size="16" aria-hidden="true" /> ПРОВЕРЬ СЕБЯ</div>
            <QuizPlayer :mode="`theory-${topic.id}`" :pool="[getQuestion(topic.checkQuestionId)].filter(Boolean)" :size="1" start-label="Ответить на вопрос" />
          </div>
        </div>
      </details>
    </div>
  </div>
</template>