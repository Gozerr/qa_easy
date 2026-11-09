import { init, miniApp, themeParams, viewport, backButton } from '@tma.js/sdk-vue'
import { ref } from 'vue'

export function initializeTelegram({ onBack, onTheme }) {
  const webApp = typeof window === 'undefined' ? null : window.Telegram?.WebApp
  const theme = ref(null)
  const integration = { available: false, theme, ready: () => {}, showBack: () => {}, hideBack: () => {}, cleanup: () => {} }
  if (!webApp) return integration

  try {
    init()

    if (!miniApp.isMounted() && miniApp.mount.isAvailable()) miniApp.mount()
    if (!themeParams.isMounted() && themeParams.mount.isAvailable()) themeParams.mount()
    if (miniApp.bindCssVars.isAvailable()) miniApp.bindCssVars()
    if (themeParams.bindCssVars.isAvailable()) themeParams.bindCssVars()

    if (viewport.mount.isAvailable()) {
      viewport.mount().then(() => {
        if (viewport.bindCssVars.isAvailable()) viewport.bindCssVars()
        if (viewport.expand.isAvailable()) viewport.expand()
      }).catch(() => {})
    }

    if (!backButton.isMounted() && backButton.mount.isAvailable()) backButton.mount()
    if (backButton.onClick.isAvailable()) backButton.onClick(onBack)
    const updateTheme = () => {
      const currentTheme = webApp.colorScheme === 'dark' ? 'dark' : 'light'
      theme.value = currentTheme
      onTheme?.(currentTheme)
    }
    updateTheme()

    webApp.onEvent('themeChanged', updateTheme)

    integration.available = true
    integration.ready = () => miniApp.ready.isAvailable() && miniApp.ready()
    integration.showBack = () => backButton.show.isAvailable() && backButton.show()
    integration.hideBack = () => backButton.hide.isAvailable() && backButton.hide()
    integration.cleanup = () => {
      webApp.offEvent('themeChanged', updateTheme)
      if (backButton.offClick.isAvailable()) backButton.offClick(onBack)
    }
    return integration
  } catch {
    return integration
  }
}