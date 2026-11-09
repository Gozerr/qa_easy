<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LoaderCircle, Moon, Sun } from '@lucide/vue'
import BottomNavigation from './components/BottomNavigation.vue'
import { useProgress } from './composables/useProgress.js'

const route = useRoute()
const router = useRouter()
const { progress, storageWarning, pendingSync, cloudStatus, authenticateTelegram, syncPendingAttempts, setTheme } = useProgress()
const telegram = inject('telegram')
const telegramTheme = telegram?.theme ?? ref(null)
const systemTheme = ref(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

const currentTheme = computed(() => progress.theme === 'system'
  ? telegramTheme.value ?? systemTheme.value
  : progress.theme)
const isDark = computed(() => currentTheme.value === 'dark')
const retryingAuth = ref(false)

function navigateBack() {
  if (window.history.state?.back) router.back()
  else router.push('/')
}

function toggleTheme() {
  setTheme(isDark.value ? 'light' : 'dark')
}

function updateTelegramBackButton() {
  if (!telegram?.available) return
  if (route.path === '/') telegram.hideBack()
  else telegram.showBack()
}

async function retryAuthentication() {
  retryingAuth.value = true
  try {
    await authenticateTelegram()
  } catch {
  } finally {
    retryingAuth.value = false
  }
}

let recoveringPendingAttempts = false

async function recoverPendingAttempts() {
  if (!pendingSync.value || recoveringPendingAttempts) return
  recoveringPendingAttempts = true
  try {
    if (cloudStatus.value === 'ready') await syncPendingAttempts()
    if (pendingSync.value) {
      try {
        await authenticateTelegram()
      } catch {
      }
    }
  } finally {
    recoveringPendingAttempts = false
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') recoverPendingAttempts()
}

let removeRouteHook
let mediaQuery
const handleSystemTheme = (event) => { systemTheme.value = event.matches ? 'dark' : 'light' }

watch(() => route.path, updateTelegramBackButton)

onMounted(() => {
  mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  mediaQuery?.addEventListener?.('change', handleSystemTheme)
  telegram?.ready()
  removeRouteHook = router.afterEach(updateTelegramBackButton)
  updateTelegramBackButton()
  window.addEventListener('online', recoverPendingAttempts)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener?.('change', handleSystemTheme)
  window.removeEventListener('online', recoverPendingAttempts)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  telegram?.cleanup()
  removeRouteHook?.()
})
</script>

<template>
  <div class="app-root" :data-theme="currentTheme">
    <div class="app-frame">
      <header class="topbar">
        <RouterLink class="brand" to="/" aria-label="QA на пальцах, главная">
          <span class="brand-mark"><span>Q</span><i aria-hidden="true"></i></span>
          <span class="brand-name">QA на пальцах</span>
        </RouterLink>
        <div class="topbar-actions">
          <span class="topbar-label">ТРЕНАЖЁР QA</span>
          <button
            class="icon-button theme-toggle"
            type="button"
            :aria-label="isDark ? 'Включить светлую тему' : 'Включить тёмную тему'"
            :title="isDark ? 'Светлая тема' : 'Тёмная тема'"
            @click="toggleTheme"
          >
            <Sun v-if="isDark" :size="19" aria-hidden="true" />
            <Moon v-else :size="19" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div v-if="storageWarning" class="notice notice-warning" role="status">
        Не удалось прочитать старый прогресс. Начали заново; проверьте настройки хранения браузера.
      </div>
      <div v-if="pendingSync" class="notice notice-warning" role="status">
        Есть ответ, который ещё не подтверждён сервером. Он не добавлен к облачному счёту.
      </div>
      <div v-if="cloudStatus === 'unconfigured' || cloudStatus === 'browser'" class="mode-indicator" role="status">
        {{ cloudStatus === 'browser' ? 'Прогресс хранится на этом устройстве' : 'Локальный режим · облачная синхронизация не настроена' }}
      </div>
      <div v-else-if="cloudStatus === 'connecting'" class="mode-indicator" role="status">Проверяем сессию Telegram…</div>
      <div v-else-if="cloudStatus === 'ready' && cloudError" class="notice notice-warning" role="status">{{ cloudError }}</div>
      <div v-else-if="cloudStatus === 'error'" class="notice notice-warning cloud-notice" role="status">
        <span>Не удалось подтвердить сессию. Ответы не будут засчитаны в облаке.</span>
        <button class="button button-quiet" type="button" :disabled="retryingAuth" @click="retryAuthentication">
          <LoaderCircle v-if="retryingAuth" :size="15" class="spinner" aria-hidden="true" />
          {{ retryingAuth ? 'Проверяем…' : 'Повторить' }}
        </button>
      </div>

      <main id="main-content" class="main-content">
        <RouterView v-slot="{ Component }">
          <Transition name="route" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </Transition>
        </RouterView>
      </main>

      <BottomNavigation />
    </div>
  </div>
</template>