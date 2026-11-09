import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { initializeTelegram } from './lib/telegram.js'
import { isSupabaseConfigured } from './lib/supabaseClient.js'
import { useProgress } from './composables/useProgress.js'
import './style.css'

function navigateBack() {
	if (window.history.state?.back) router.back()
	else router.push('/')
}

const telegram = initializeTelegram({ onBack: navigateBack })

createApp(App)
	.provide('telegram', telegram)
	.use(router)
	.mount('#app')

if (isSupabaseConfigured && telegram.available) useProgress().authenticateTelegram().catch(() => {})