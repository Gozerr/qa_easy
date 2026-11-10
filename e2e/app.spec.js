import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', (route) => route.abort())
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('QA Daily сохраняет ответ и отмечает выполненное задание в профиле', async ({ page }) => {
  await page.getByRole('link', { name: /ЗАДАНИЕ ДНЯ/ }).click()
  await expect(page.getByRole('heading', { name: 'Миссии недели' })).toBeVisible()
  await expect(page.locator('.activity-calendar-day')).toHaveCount(7)
  await expect(page.locator('.weekly-missions-gate')).toContainText('доступны в подтверждённой сессии Telegram')
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
  await page.getByRole('link', { name: /История XP и наград/ }).click()
  await expect(page.getByRole('heading', { name: 'Опыт и награды' })).toBeVisible()
  await expect(page.locator('.xp-history-item')).toHaveCount(1)
})

test('коллекция достижений показывает прогресс и фильтруется по категориям', async ({ page }) => {
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.locator('.achievement-row')).toHaveCount(0)
  await page.getByRole('link', { name: 'Все 34' }).click()
  await expect(page.getByRole('heading', { name: 'Все достижения' })).toBeVisible()
  await expect(page.locator('.achievement-row')).toHaveCount(34)
  await page.getByRole('button', { name: 'Точность' }).click()
  await expect(page.locator('.achievement-row')).toHaveCount(4)
  await expect(page.locator('.achievement-row').first()).toContainText('Точный глаз')
  await expect(page.locator('.achievement-row .achievement-progress-track').first()).toHaveAttribute('role', 'progressbar')
})

test('профиль показывает пять самых недавно полученных достижений', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('qa-na-paltsakh:progress', JSON.stringify({
    version: 7,
    xp: 500,
    answeredCount: 25,
    correctCount: 25,
    completedQuestionIds: Array.from({ length: 25 }, (_, index) => `qa-${String(index + 1).padStart(2, '0')}`),
    dailyCompletions: [],
    activeSessions: {},
    pendingCloudAttempts: [],
    completedLessonIds: [],
    practiceResults: {},
    lessonPractices: {},
    xpTransactions: [],
    achievementDates: {
      'first-answer': '2025-01-01T00:00:00.000Z',
      'first-correct': '2025-01-02T00:00:00.000Z',
      'ten-answers': '2025-01-03T00:00:00.000Z',
      'twenty-five-answers': '2025-01-04T00:00:00.000Z',
      'ten-correct': '2025-01-05T00:00:00.000Z',
      'twenty-five-correct': '2025-01-06T00:00:00.000Z',
    },
    theme: 'light',
  })))
  await page.reload()
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.locator('.achievement-row')).toHaveCount(5)
  await expect(page.locator('.achievement-row').first()).toContainText('Верная стратегия')
  await expect(page.locator('.achievement-row').last()).not.toContainText('Первый шаг')
})

test('SQL и API Lab проверяют исправленные данные и сохраняют результат локально', async ({ page }) => {
  await page.goto('lab')
  await page.locator('#sql-query').fill('SELECT id, email FROM users WHERE active = true ORDER BY id ASC')
  await page.getByRole('button', { name: 'Выполнить' }).click()
  await expect(page.locator('.lab-result')).toContainText('набор строк и порядок совпали')

  for (let index = 0; index < 3; index += 1) await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#sql-query').fill('SELECT users.name, orders.id, orders.total FROM users LEFT JOIN orders ON users.id = orders.user_id ORDER BY users.id, orders.id')
  await page.getByRole('button', { name: 'Выполнить' }).click()
  await expect(page.locator('.lab-result')).toContainText('набор строк и порядок совпали')

  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#sql-query').fill('SELECT users.name, COUNT(orders.id) AS order_count, SUM(orders.total) AS total FROM users LEFT JOIN orders ON users.id = orders.user_id GROUP BY users.id, users.name ORDER BY total DESC')
  await page.getByRole('button', { name: 'Выполнить' }).click()
  await expect(page.locator('.lab-result')).toContainText('набор строк и порядок совпали')

  await page.getByRole('button', { name: /API Lab/ }).click()
  await page.locator('#api-response').fill(JSON.stringify({ orderId: 'ord-104', status: 'paid', total: 1299, payment: { status: 'paid', amount: 1299 }, currency: 'RUB' }, null, 2))
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('.lab-result')).toContainText('соответствует проверяемым условиям')

  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#api-response').fill(JSON.stringify({ status: 422, body: { error: { code: 'VALIDATION_ERROR', message: 'Поле amount должно быть числом' } } }, null, 2))
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('.lab-result')).toContainText('соответствует проверяемым условиям')

  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#api-response').fill(JSON.stringify({ idempotencyKey: 'pay-42', first: { status: 'paid', transactionId: 'txn-101', amount: 500 }, retry: { status: 'paid', transactionId: 'txn-101', amount: 500 }, chargeCount: 1 }, null, 2))
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('.lab-result')).toContainText('соответствует проверяемым условиям')

  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#api-response').fill(JSON.stringify({ requests: [
    { actorId: null, role: null, resourceOwnerId: 'user-200', response: { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Требуется вход' } } } },
    { actorId: 'user-100', role: 'user', resourceOwnerId: 'admin', response: { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Недостаточно прав' } } } },
  ] }, null, 2))
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('.lab-result')).toContainText('соответствует проверяемым условиям')

  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#api-response').fill(JSON.stringify({ deliveries: [{ eventId: 'evt-900', responseStatus: 200 }, { eventId: 'evt-900', responseStatus: 200 }], processedEventIds: ['evt-900'], appliedTransitions: 1, orderStatus: 'paid' }, null, 2))
  await page.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(page.locator('.lab-result')).toContainText('соответствует проверяемым условиям')
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qa-na-paltsakh:progress')).practiceResults).length)).toBe(8)
})

test('QA Arena завершает десять вопросов и сохраняет локальный результат без ложного рейтинга', async ({ page }) => {
  await page.goto('arena')
  await expect(page.getByRole('heading', { name: 'QA Arena' })).toBeVisible()
  await expect(page.locator('.arena-local-note').first()).toContainText('Локальные ответы не участвуют в рейтинге')
  await page.getByRole('button', { name: 'Войти на арену' }).click()

  for (let index = 0; index < 10; index += 1) {
    await page.locator('.answer-option').first().click()
    await page.getByRole('button', { name: 'Проверить ответ' }).click()
    await expect(page.locator('.feedback-box')).toBeVisible()
    await page.getByRole('button', { name: index === 9 ? 'К результатам' : 'Следующий вопрос' }).click()
  }

  await expect(page.locator('.result-state h2')).toContainText('из 10 верно')
  await expect(page.locator('.arena-result-status')).toContainText('Локальный результат сохранён')
  await expect(page.locator('.arena-local-best')).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-na-paltsakh:progress')).practiceResults['arena-scenarios']?.bestScore)).toBeGreaterThanOrEqual(0)
})

test('тематический марафон сохраняет отдельный результат навыка', async ({ page }) => {
  await page.goto('marathons')
  await expect(page.getByRole('heading', { name: 'Тематические марафоны' })).toBeVisible()
  await expect(page.locator('.marathon-track-card')).toHaveCount(3)
  await expect(page.locator('.marathon-local-note')).toContainText('только серверно проверенные результаты')
  await page.getByRole('button', { name: /Web и API/ }).click()
  await expect(page.locator('.marathon-challenge-heading h2')).toHaveText('Web и API')
  await page.getByRole('button', { name: 'Начать марафон' }).click()

  for (let index = 0; index < 10; index += 1) {
    await page.locator('.answer-option').first().click()
    await page.getByRole('button', { name: 'Проверить ответ' }).click()
    await expect(page.locator('.feedback-box')).toBeVisible()
    await page.getByRole('button', { name: index === 9 ? 'К результатам' : 'Следующий вопрос' }).click()
  }

  await expect(page.locator('.result-state h2')).toContainText('из 10 верно')
  await expect(page.locator('.marathon-challenge-card')).toContainText('Результат марафона:')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('qa-na-paltsakh:progress')).practiceResults['marathon-web-api']?.bestScore)).toBeGreaterThanOrEqual(0)
})

test('практикум связывает кейсы, баг-репорты и ветвящееся расследование', async ({ page }) => {
  await page.goto('practice')
  await page.getByRole('button', { name: 'Тест-кейсы' }).click()
  const cases = [
    ['positive', 'Ввести корректный email и совпадающее подтверждение', 'Пользователь создан и видит подтверждение регистрации'],
    ['negative', 'Отправить email без символа @', 'Форма показывает ошибку и не создаёт пользователя'],
    ['boundary', 'Ввести пароль минимальной допустимой длины', 'Пароль на границе принимается согласно правилу'],
    ['validation', 'Ввести разные значения пароля и подтверждения', 'Отправка заблокирована с сообщением о несовпадении'],
  ]
  for (const [category, condition, expected] of cases) {
    await page.getByLabel('Тип проверки').selectOption(category)
    await page.getByLabel('Условие или данные').fill(condition)
    await page.getByLabel('Ожидаемый результат').fill(expected)
    await page.getByRole('button', { name: 'Добавить кейс' }).click()
  }
  await page.getByRole('button', { name: 'Оценить покрытие' }).click()
  await expect(page.locator('.activity-feedback strong')).toContainText('покрывает четыре')

  await page.getByRole('button', { name: 'Баг-репорт' }).click()
  await page.getByLabel('Заголовок', { exact: true }).fill('Payments: повтор после timeout списывает оплату дважды')
  await page.getByLabel('Окружение').fill('Android 15, Telegram 12, QA build 42')
  await page.getByLabel('Предусловия').fill('Пользователь вошёл, создан неоплаченный заказ на 1200 рублей')
  await page.getByLabel('Шаги · каждый с новой строки').fill('Начать оплату заказа\nДождаться сетевого timeout\nПовторить запрос и проверить транзакции')
  await page.getByLabel('Фактический результат').fill('У провайдера созданы две транзакции и списаны 2400 рублей')
  await page.getByLabel('Ожидаемый результат').fill('Для заказа создана одна транзакция на 1200 рублей')
  await page.getByLabel('Severity').selectOption('Критическая')
  await page.getByLabel('Priority').selectOption('Немедленно')
  await page.getByRole('button', { name: 'Проверить баг-репорт' }).click()
  await expect(page.locator('.activity-feedback strong')).toContainText('Отчёт можно передавать')

  await page.getByRole('button', { name: 'QA Detective' }).click()
  await page.getByLabel(/Логи платёжных попыток/).check()
  await page.getByRole('button', { name: 'Изучить данные' }).click()
  await page.getByLabel(/Повторный запрос не был идемпотентным/).check()
  await page.getByRole('button', { name: 'Сформировать план проверок' }).click()
  await page.getByLabel(/с тем же idempotency key/).check()
  await page.getByLabel(/Повторно доставить callback/).check()
  await page.getByRole('button', { name: 'Составить отчёт' }).click()
  await page.locator('#detective-title').fill('Payments: повторный запрос после timeout создаёт второе списание')
  await page.locator('#detective-steps').fill('Создать заказ и начать оплату\nДождаться timeout и повторить запрос\nСверить transaction ID у провайдера')
  await page.getByRole('button', { name: 'Завершить расследование' }).click()
  await expect(page.locator('.detective-stage h3')).toContainText('100%')
})

test('собеседование переключает набор, а теория открывает фильтрованный материал', async ({ page }) => {
  await page.goto('interview')
  await expect(page.getByText('18 вопросов')).toBeVisible()
  await page.getByRole('button', { name: /Middle/ }).click()
  await expect(page.getByText('12 вопросов')).toBeVisible()
  await page.getByRole('button', { name: 'Начать подготовку' }).click()
  await expect(page.locator('.question-heading h2')).toBeVisible()

  await page.goto('theory?category=Web%20%D0%B8%20API')
  await expect(page.locator('.skill-comparison')).toContainText('Сравнение навыков')
  await expect(page.locator('.skill-node')).toHaveCount(10)
  await expect(page.locator('.skill-comparison-note')).toContainText('подтверждённой сессии Telegram')
  await expect(page.locator('.theory-topic')).toHaveCount(1)
  await expect(page.locator('#web-testing').getByText('Web-тестирование', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /SQL и базы данных/ }).click()
  await expect(page.locator('.theory-topic')).toHaveCount(10)
  await expect(page.locator('#sql-databases')).toHaveAttribute('open', '')
})

test('практика каждого урока сохраняется и отмечает урок изученным', async ({ page }) => {
  await page.goto('theory')
  await expect(page.locator('.lesson-practice')).toHaveCount(50)
  const firstLesson = page.locator('.lesson-block').first()
  await firstLesson.locator('textarea').nth(0).fill('Проверить повторную отправку платежного запроса')
  await firstLesson.locator('textarea').nth(1).fill('Отправить один и тот же запрос дважды после тайм-аута')
  await firstLesson.locator('textarea').nth(2).fill('В истории есть одно списание и один заказ')
  await firstLesson.getByRole('button', { name: 'Сохранить практику' }).click()
  await expect(firstLesson.getByRole('status')).toContainText('Практика сохранена')
  await expect(firstLesson.getByRole('button', { name: 'Урок изучен' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  const restoredLesson = page.locator('.lesson-block').first()
  await expect(restoredLesson.locator('textarea').nth(0)).toHaveValue('Проверить повторную отправку платежного запроса')
  await expect(restoredLesson.getByRole('status')).toContainText('Практика сохранена')
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
    const routes = ['./', 'theory', 'practice', 'lab', 'arena', 'marathons', 'interview', 'daily', 'profile', 'xp-history', 'achievements', 'leaderboard']

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
