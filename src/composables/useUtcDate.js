import { computed, onMounted, onUnmounted, ref } from 'vue'
import { utcDateKey } from '../lib/dailyTask.js'

export function useUtcDate() {
  const date = ref(utcDateKey())
  let intervalId

  onMounted(() => {
    intervalId = window.setInterval(() => {
      date.value = utcDateKey()
    }, 30_000)
  })

  onUnmounted(() => window.clearInterval(intervalId))
  return computed(() => date.value)
}