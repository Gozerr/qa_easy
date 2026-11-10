<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  label: { type: String, default: '' },
  size: { type: String, default: '' },
})

const imageFailed = ref(false)
watch(() => props.src, () => { imageFailed.value = false })
const initials = computed(() => props.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('ru-RU') || 'QA')
</script>

<template>
  <span class="user-avatar" :class="size" :aria-label="label || name || 'Аватар пользователя'" role="img">
    <img v-if="src && !imageFailed" :src="src" alt="" loading="lazy" referrerpolicy="no-referrer" @error="imageFailed = true">
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>
