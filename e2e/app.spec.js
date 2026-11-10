import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', (route) => route.abort())
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('QA Daily сохраняет ответ и отмечает выполненное задание в профиле', async ({ page }) => {
  await page.getByRole('link', { name: /ЗАДАНИЕ ДНЯ/ }).click()
  await page.getByRole('button', { name: 'Взяться за задачу' }).click()
  await page.locator('.answer-option').first().click()
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('.feedback-box')).toBeVisible()
  await page.getByRole('button', { name: 'К результатам' }).click()
  await expect(page.locator('.result-state h2')).toHaveText(/\d из 1 верно/)

  await page.reload()
  await expect(page.locator('.result-state')).toBeVisible()
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.locator('.profile-daily-count strong')).toHaveText('1')
  await expect(page.locator('.xp-mark')).not.toHaveText(/^\s*0 XP$/)
})

test('коллекция достижений показывает прогресс и фильтруется по категориям', async ({ page }) => {
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.locator('.achievement-row')).toHaveCount(0)
  await page.getByRole('link', { name: 'Все 29' }).click()
  await expect(page.getByRole('heading', { name: 'Все достижения' })).toBeVisible()
  await expect(page.locator('.achievement-row')).toHaveCount(29)
  await page.getByRole('button', { name: 'Точность' }).click()
  await expect(page.locator('.achievement-row')).toHaveCount(4)
  await expect(page.locator('.achievement-row').first()).toContainText('Точный глаз')
  await expect(page.locator('.achievement-row .achievement-progress-track').first()).toHaveAttribute('role', 'progressbar')
})

test('собеседование переключает набор, а теория открывает фильтрованный материал', async ({ page }) => {
  await page.goto('interview')
  await expect(page.getByText('18 вопросов')).toBeVisible()
  await page.getByRole('button', { name: /Middle/ }).click()
  await expect(page.getByText('12 вопросов')).toBeVisible()
  await page.getByRole('button', { name: 'Начать подготовку' }).click()
  await expect(page.locator('.question-heading h2')).toBeVisible()

  await page.goto('theory?category=Web%20%D0%B8%20API')
  await expect(page.locator('.theory-topic')).toHaveCount(1)
  await expect(page.getByText('Web-тестирование', { exact: true })).toBeVisible()
})

test('тема сохраняется после перезагрузки', async ({ page }) => {
  const root = page.locator('.app-root')
  const originalTheme = await root.getAttribute('data-theme')
  const nextTheme = originalTheme === 'dark' ? 'light' : 'dark'
  const toggleLabel = originalTheme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'

  await page.getByRole('button', { name: toggleLabel }).click()
  await expect(root).toHaveAttribute('data-theme', nextTheme)
  await page.reload()
  await expect(root).toHaveAttribute('data-theme', nextTheme)
})

  test('рейтинг в обычном браузере требует подтверждённую Telegram-сессию', async ({ page }) => {
    await page.getByRole('link', { name: 'Рейтинг' }).click()
    await expect(page.getByRole('heading', { name: 'Рейтинг' })).toBeVisible()
    await expect(page.locator('.leaderboard-unavailable')).toContainText('Рейтинг доступен в Telegram')
    await expect(page.locator('.leaderboard-table')).toHaveCount(0)
    await expect(page.locator('.leaderboard-settings')).toHaveCount(0)
  })

test('сброс прогресса требует подтверждения и очищает данные', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('qa-na-paltsakh:progress', JSON.stringify({
    version: 1,
    xp: 42,
    answeredCount: 1,
    correctCount: 1,
    completedQuestionIds: ['qa-01'],
    dailyCompletions: [],
    activeSessions: {},
    theme: 'system',
  })))
  await page.reload()
  await page.goto('profile')
  await expect(page.locator('.xp-mark')).toContainText('42 XP')

  await page.getByRole('button', { name: 'Сбросить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Удалить весь прогресс?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Оставить как есть' }).click()
  await expect(page.locator('.xp-mark')).toContainText('42 XP')

  await page.getByRole('button', { name: 'Сбросить' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить прогресс' }).click()
  await expect(page.locator('.xp-mark')).toContainText('0 XP')
})

test('malformed localStorage и вредоносный query остаются неисполняемыми данными', async ({ page }) => {
  let dialogOpened = false
  page.on('dialog', async (dialog) => {
    dialogOpened = true
    await dialog.dismiss()
  })

  await page.evaluate(() => localStorage.setItem('qa-na-paltsakh:progress', '{malformed'))
  await page.goto('profile?next=javascript%3Aalert(1)&label=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E')
  await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible()
  await expect(page.locator('.notice-warning').first()).toContainText('Не удалось прочитать старый прогресс')
  await expect(page.locator('img[onerror], script:not([src])')).toHaveCount(0)
  await expect(page).toHaveURL(/\/profile\?next=javascript/)
  expect(dialogOpened).toBe(false)

  await page.goto('not-a-real-route')
  await expect(page.getByRole('heading', { name: 'Такой страницы нет' })).toBeVisible()
})

test('все экраны не переполняют viewport в двух темах на телефоне, планшете и desktop', async ({ page }) => {
  const widths = [320, 360, 390, 768, 1280]
    const routes = ['./', 'theory', 'practice', 'interview', 'daily', 'profile', 'achievements', 'leaderboard']

  for (const width of widths) {
    await page.setViewportSize({ width, height: 850 })
    for (const theme of ['light', 'dark']) {
      await page.goto('./')
      await page.evaluate((selectedTheme) => {
        const key = 'qa-na-paltsakh:progress'
        const current = JSON.parse(localStorage.getItem(key) || '{}')
        localStorage.setItem(key, JSON.stringify({
          version: 2,
          xp: Number.isSafeInteger(current.xp) ? current.xp : 0,
          answeredCount: Number.isSafeInteger(current.answeredCount) ? current.answeredCount : 0,
          correctCount: Number.isSafeInteger(current.correctCount) ? current.correctCount : 0,
          completedQuestionIds: Array.isArray(current.completedQuestionIds) ? current.completedQuestionIds : [],
          dailyCompletions: Array.isArray(current.dailyCompletions) ? current.dailyCompletions : [],
          activeSessions: current.activeSessions && typeof current.activeSessions === 'object' ? current.activeSessions : {},
          pendingCloudAttempts: Array.isArray(current.pendingCloudAttempts) ? current.pendingCloudAttempts : [],
          theme: selectedTheme,
        }))
      }, theme)
      await page.reload()

      for (const route of routes) {
        await page.goto(route)
        await expect(page.locator('.app-root')).toHaveAttribute('data-theme', theme)
        const dimensions = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        }))
        expect(dimensions.documentWidth, `${route} overflows at ${width}px in ${theme}`).toBeLessThanOrEqual(dimensions.viewportWidth + 1)
      }
    }
  }
})
