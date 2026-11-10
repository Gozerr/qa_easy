try {
  const saved = JSON.parse(localStorage.getItem('qa-na-paltsakh:progress') || 'null')
  const selected = ['light', 'dark'].includes(saved?.theme) ? saved.theme : null
  const telegramTheme = window.Telegram?.WebApp?.colorScheme
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = selected || (telegramTheme === 'dark' ? 'dark' : telegramTheme === 'light' ? 'light' : systemTheme)
} catch {
  document.documentElement.dataset.theme = 'light'
}
