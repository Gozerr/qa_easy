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
  const activityType = await page.locator('.daily-detail').getAttribute('data-activity-type')
  if (activityType === 'question') {
    await page.getByRole('button', { name: 'Взяться за задачу' }).click()
    await page.locator('.answer-option').first().click()
    await page.getByRole('button', { name: 'Проверить ответ' }).click()
    await expect(page.locator('.feedback-box')).toBeVisible()
    await page.getByRole('button', { name: 'К результатам' }).click()
    await expect(page.locator('.result-state h2')).toHaveText(/\d из 1 верно/)
  } else if (activityType === 'test-design') {
    await page.getByLabel('Условие кейса 1').fill('Отправить форму с корректными тестовыми данными')
    await page.getByLabel('Ожидаемый результат кейса 1').fill('Сервис сохраняет один корректный результат')
    await page.getByLabel('Условие кейса 2').fill('Отправить пустое обязательное значение')
    await page.getByLabel('Ожидаемый результат кейса 2').fill('Сервис отклоняет запрос и сохраняет состояние')
    await page.getByRole('button', { name: 'Сохранить задание' }).click()
    await expect(page.locator('.daily-challenge-saved')).toBeVisible()
  } else {
    await page.getByLabel('Заголовок').fill('API: повторный запрос сохраняет некорректное состояние')
    await page.getByLabel('Окружение').fill('Android, Telegram Mini App, QA')
    await page.getByLabel('Предусловия').fill('Есть тестовый пользователь и подготовленный объект')
    await page.getByLabel('Шаги · каждый с новой строки').fill('Подготовить тестовые данные\nВыполнить описанное действие\nПроверить ответ и состояние')
    await page.getByLabel('Фактический результат').fill('Система сохраняет неожиданный результат')
    await page.getByLabel('Ожидаемый результат').fill('Система отклоняет операцию и оставляет состояние прежним')
    await page.getByLabel('Серьёзность').selectOption('Высокая')
    await page.getByLabel('Приоритет').selectOption('Высокий')
    await page.getByRole('button', { name: 'Сохранить задание' }).click()
    await expect(page.locator('.daily-challenge-saved')).toBeVisible()
  }

  await page.reload()
  if (activityType === 'question') await expect(page.locator('.result-state')).toBeVisible()
  else await expect(page.locator('.daily-challenge-saved')).toBeVisible()
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.locator('.profile-daily-count strong')).toHaveText('1')
  await expect(page.locator('.xp-mark')).not.toHaveText(/^\s*0 XP$/)
  await page.getByRole('link', { name: /История XP и наград/ }).click()
  await expect(page.getByRole('heading', { name: 'Опыт и награды' })).toBeVisible()
  await expect(page.locator('.xp-history-item')).toHaveCount(activityType === 'question' ? 1 : 0)
})

test('QA Daily чередует викторину, конструктор тестов и баг-репорт по UTC', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T12:00:00.000Z') })
  const activities = [
    ['2026-11-10', 'question'],
    ['2026-11-12', 'test-design'],
    ['2026-11-13', 'bug-report'],
  ]
  for (const [date, type] of activities) {
    await page.clock.setFixedTime(new Date(`${date}T12:00:00.000Z`))
    await page.goto('daily')
    await expect(page.locator('.daily-detail')).toHaveAttribute('data-activity-type', type)
    if (type === 'test-design') {
      await page.getByLabel('Условие кейса 1').fill('Проверить валидный входной объект')
      await page.getByLabel('Ожидаемый результат кейса 1').fill('Создаётся ровно одна запись')
      await page.getByLabel('Условие кейса 2').fill('Передать пустое обязательное поле')
      await page.getByLabel('Ожидаемый результат кейса 2').fill('Запрос отклонён без изменения состояния')
      await page.getByRole('button', { name: 'Сохранить задание' }).click()
      await expect(page.locator('.daily-challenge-saved')).toBeVisible()
    }
    if (type === 'bug-report') {
      await page.getByLabel('Заголовок').fill('API: повторный запрос создаёт побочный эффект')
      await page.getByLabel('Окружение').fill('iOS 18, Telegram Mini App, QA')
      await page.getByLabel('Предусловия').fill('Подготовлен синтетический пользователь и запись')
      await page.getByLabel('Шаги · каждый с новой строки').fill('Выполнить действие один раз\nПовторить после сетевого сбоя')
      await page.getByLabel('Фактический результат').fill('Появилось повторное изменение состояния')
      await page.getByLabel('Ожидаемый результат').fill('Повторный запрос не применяет действие второй раз')
      await page.getByLabel('Серьёзность').selectOption('Средняя')
      await page.getByLabel('Приоритет').selectOption('Обычный')
      await page.getByRole('button', { name: 'Сохранить задание' }).click()
      await expect(page.locator('.daily-challenge-saved')).toBeVisible()
    }
  }
  await page.reload()
  await expect(page.locator('.daily-challenge-saved')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qa-na-paltsakh:progress')).dailyChallenges).length)).toBe(2)
})

test('коллекция достижений показывает прогресс и фильтруется по категориям', async ({ page }) => {
  await page.getByRole('link', { name: 'Профиль', exact: true }).click()
  await expect(page.locator('.achievement-row')).toHaveCount(0)
  await page.getByRole('link', { name: 'Все 36' }).click()
  await expect(page.getByRole('heading', { name: 'Все достижения' })).toBeVisible()
  await expect(page.locator('.achievement-row')).toHaveCount(36)
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

  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#sql-query').fill('SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status HAVING COUNT(*) > 1 ORDER BY status')
  await page.getByRole('button', { name: 'Выполнить' }).click()
  await expect(page.locator('.lab-result')).toContainText('набор строк и порядок совпали')

  await page.getByRole('button', { name: 'Следующее упражнение' }).click()
  await page.locator('#sql-query').fill('SELECT name FROM users WHERE id IN (SELECT user_id FROM orders WHERE total >= 100) ORDER BY name')
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
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qa-na-paltsakh:progress')).practiceResults).length)).toBe(10)
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

test('сквозные проекты проверяют API security, интеграции и стабильность CI и сохраняют ответы', async ({ page }) => {
  await page.goto('projects')
  await expect(page.getByRole('heading', { name: 'Собери решение по шагам' })).toBeVisible()
  const projects = [
    {
      title: /Заказ, который увидел не тот пользователь/,
      answers: [
        /На сервере проверить сессию и принадлежность заказа текущему пользователю/,
        /Сверить владельца, другого пользователя и роль администратора/,
        /Вернуть согласованный 403 или 404/,
        /Синтетические аккаунты A\/B/,
      ],
      artifact: 'Role | Operation | Expected\nOwner | GET /orders/id | 200 own order\nOther user | GET /orders/id | 403 without order fields\nOther user | PATCH /orders/id | reject with no data changes\nAdmin | GET /orders/id | allowed by role',
      criteria: 3,
    },
    {
      title: /Платёжный callback пришёл дважды/,
      answers: [
        /Дважды отправить один event ID/,
        /изолированной тестовой БД и контролируемой очередью/,
        /Повтор с тем же ключом безопасен/,
        /Корреляционный ID, event ID/,
      ],
      artifact: 'Event ID | Action | Expected\nSame event ID and idempotency key | Deliver the same event twice after timeout | One transaction\nTimeout after commit | Retry with same key | Stable order state\nQueue retry | Verify database and provider state',
      criteria: 4,
    },
    {
      title: /Нестабильный checkout в CI/,
      answers: [
        /Правила расчёта покрыть быстрыми unit\/API тестами/,
        /Устойчивым доступным locator по роли кнопки/,
        /изолированные тестовые данные через fixture/,
        /Ждать конкретного состояния интерфейса/,
      ],
      artifact: 'Unit: discount boundaries; API integration: payment contract; E2E smoke.\nFixture creates a unique test ID and cleans up only its own data.\nUse a locator by role and accessible name.\nWait for paid state, save trace and logs, avoid sleep.',
      criteria: 4,
    },
  ]

  for (const project of projects) {
    await page.getByRole('button', { name: project.title }).click()
    for (let index = 0; index < project.answers.length; index += 1) {
      await page.getByRole('button', { name: project.answers[index] }).click()
      await expect(page.locator('.project-explanation')).toBeVisible()
      if (index < project.answers.length - 1) await page.getByRole('button', { name: 'Дальше' }).click()
    }
    await expect(page.locator('.project-result')).toContainText('Проект сдан · 100%')
    await page.getByRole('textbox', { name: 'Черновик' }).fill(project.artifact)
    await page.getByRole('button', { name: 'Проверить артефакт' }).click()
    await expect(page.locator('.project-artifact-rubric p.is-passed')).toHaveCount(project.criteria)
  }

  await page.reload()
  await expect(page.locator('.project-result')).toContainText('Проект сдан · 100%')
  await expect(page.locator('.project-picker-card.is-complete')).toHaveCount(3)
  await page.getByRole('button', { name: /Нестабильный checkout в CI/ }).click()
  await expect(page.getByRole('textbox', { name: 'Черновик' })).toHaveValue(/Unit: discount boundaries/)
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qa-na-paltsakh:progress')).projectProgress).length)).toBe(3)
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

  const additionalCaseSets = [
    ['password-reset', [
      ['positive', 'Запросить ссылку для зарегистрированного адреса', 'Показано нейтральное подтверждение, ссылка отправлена один раз'],
      ['negative', 'Передать неизвестный email', 'Ответ не раскрывает наличие аккаунта'],
      ['boundary', 'Открыть токен на границе срока действия', 'Срок проверяется по серверному времени и заданному правилу'],
      ['validation', 'Повторно использовать уже погашенный токен', 'Пароль не меняется, клиент получает понятную ошибку'],
    ]],
    ['cart-checkout', [
      ['positive', 'Увеличить количество доступного товара на единицу', 'Итог и количество в заказе пересчитаны согласованно'],
      ['negative', 'Отправить отрицательное количество товара', 'Сервер отклоняет запрос и не меняет корзину'],
      ['boundary', 'Добавить товар в максимально допустимом количестве', 'Допустимая верхняя граница принимается без переполнения суммы'],
      ['validation', 'Применить истёкший промокод', 'Скидка не применяется, отображается причина отказа'],
    ]],
  ]
  for (const [scenario, scenarios] of additionalCaseSets) {
    await page.getByLabel('Выбери сценарий конструктора тест-кейсов').selectOption(scenario)
    for (const [category, condition, expected] of scenarios) {
      await page.getByLabel('Тип проверки').selectOption(category)
      await page.getByLabel('Условие или данные').fill(condition)
      await page.getByLabel('Ожидаемый результат').fill(expected)
      await page.getByRole('button', { name: 'Добавить кейс' }).click()
    }
    await page.getByRole('button', { name: 'Оценить покрытие' }).click()
    await expect(page.locator('.activity-feedback strong')).toContainText('покрывает четыре')
  }

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

  for (const [issueId, title, actual] of [
    ['idor-order', 'Orders API: изменение ID раскрывает адрес другого клиента', 'API вернул адрес и имя владельца чужого заказа'],
    ['duplicate-notice', 'Уведомления: повтор события отправляет одно письмо дважды', 'Получатель увидел два письма об одной доставке'],
  ]) {
    await page.getByLabel('Выбери дефект для баг-репорта').selectOption(issueId)
    await expect(page.locator('.activity-feedback')).toHaveCount(0)
    await page.getByLabel('Заголовок', { exact: true }).fill(title)
    await page.getByLabel('Окружение').fill('Android 15, Telegram 12, QA build 42')
    await page.getByLabel('Предусловия').fill('Созданы синтетические аккаунты и тестовые данные для воспроизведения')
    await page.getByLabel('Шаги · каждый с новой строки').fill('Выполнить исходный запрос с тестовыми данными\nПовторить действие с другим объектом или event ID\nСверить ответ API и итоговое состояние')
    await page.getByLabel('Фактический результат').fill(actual)
    await page.getByLabel('Ожидаемый результат').fill('Защищённые данные не возвращаются, побочный эффект выполняется не более одного раза')
    await page.getByLabel('Severity').selectOption('Высокая')
    await page.getByLabel('Priority').selectOption('Высокий')
    await page.getByRole('button', { name: 'Проверить баг-репорт' }).click()
    await expect(page.locator('.activity-feedback strong')).toContainText('Отчёт можно передавать')
  }

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

  const detectiveRuns = [
    { title: /Чужой адрес в карточке заказа/, probe: /Сравнить actor ID/, cause: /Сервер проверяет только вход/, tests: [/Сравнить владельца, другого пользователя/, /Проверить отсутствие полей заказа/] },
    { title: /Уведомление отправляется повторно/, probe: /Сопоставить event ID/, cause: /не дедуплицирует повторно доставленное событие/, tests: [/Доставить один event ID повторно/, /Проверить ACK после отказа/] },
  ]
  for (const item of detectiveRuns) {
    await page.getByRole('button', { name: item.title }).click()
    await page.getByLabel(item.probe).check()
    await page.getByRole('button', { name: 'Изучить данные' }).click()
    await page.getByLabel(item.cause).check()
    await page.getByRole('button', { name: 'Сформировать план проверок' }).click()
    for (const testCase of item.tests) await page.getByLabel(testCase).check()
    await page.getByRole('button', { name: 'Составить отчёт' }).click()
    await page.locator('#detective-title').fill('Исследование дефекта и проверяемое последствие для тестовых данных')
    await page.locator('#detective-steps').fill('Создать синтетические данные и подготовить исходное состояние\nВоспроизвести запрос или повтор события\nПроверить ответ и отсутствие лишнего изменения')
    await page.getByRole('button', { name: 'Завершить расследование' }).click()
    await expect(page.locator('.detective-stage h3')).toContainText('100%')
  }
})

test('собеседование переключает набор, а теория открывает фильтрованный материал', async ({ page }) => {
  await page.goto('interview')
  await expect(page.getByText('21 вопросов')).toBeVisible()
  await page.getByRole('button', { name: /Middle/ }).click()
  await expect(page.getByText('20 вопросов')).toBeVisible()
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

test('модуль SQL завершает контрольный вопрос и сохраняет ответ после перезагрузки', async ({ page }) => {
  await page.goto('theory')
  await page.locator('.skill-node').nth(6).click()
  const module = page.locator('#sql-databases')
  const check = module.locator('.knowledge-check')
  await expect(check).toBeVisible()
  await check.getByRole('button', { name: 'Ответить на вопрос' }).click()
  await expect(check.locator('.question-heading h2')).toContainText('Нужно посчитать заказы каждого пользователя')
  await check.locator('.answer-option').first().click()
  await check.getByRole('button', { name: 'Проверить ответ' }).click()
  await expect(check.locator('.feedback-box')).toBeVisible()
  await check.getByRole('button', { name: 'К результатам' }).click()
  await expect(check.locator('.result-state h2')).toBeVisible()

  await page.reload()
  await page.locator('.skill-node').nth(6).click()
  await expect(page.locator('#sql-databases .knowledge-check .result-state h2')).toBeVisible()
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
    const routes = ['./', 'theory', 'practice', 'lab', 'projects', 'arena', 'marathons', 'interview', 'daily', 'profile', 'xp-history', 'achievements', 'leaderboard']

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
