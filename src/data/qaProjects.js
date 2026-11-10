export const qaProjects = [
  {
    id: 'idor-security',
    category: 'API SECURITY · MIDDLE',
    title: 'Заказ, который увидел не тот пользователь',
    brief: 'В API магазина запрос GET /api/orders/781 возвращает заказ. Пользователь A заменил ID на 782 и увидел имя и адрес пользователя B. Подготовь проверку риска и критерии исправления.',
    deliverable: 'План проверок авторизации на уровне объекта',
    artifact: {
      title: 'Матрица доступа к заказам',
      prompt: 'Собери матрицу «роль × операция × ожидаемый ответ». Укажи владельца, другого пользователя и администратора; включи чтение и изменение заказа.',
      placeholder: 'Роль | Операция | Ожидаемый результат\nВладелец | GET /orders/{id} | 200, только свой заказ\nДругой пользователь | GET /orders/{id} | 403 или 404, без полей заказа\nДругой пользователь | PATCH /orders/{id} | отказ, состояние без изменений\nАдминистратор | GET /orders/{id} | согласно выданной роли',
      rules: [
        { id: 'roles', label: 'Различает владельца, другого пользователя и привилегированную роль', pattern: /(владел|owner|друг(ой|ого) пользователь|other user|администратор|admin)/i },
        { id: 'read-write', label: 'Проверяет чтение и изменение/удаление объекта', pattern: /(get|чтен|просмотр)/i, and: /(patch|put|delete|измен|удален|write)/i },
        { id: 'deny', label: 'Указывает отказ 403/404 и отсутствие утечки/изменения данных', pattern: /(403|404)/i, and: /(без полей|без данных|не раскры|без измен|unchanged|no data)/i },
      ],
    },
    tasks: [
      { id: 'trust-boundary', prompt: 'Где должна приниматься авторизационное решение для GET /orders/{id}?', options: [
        { id: 'frontend', label: 'Скрыть чужие заказы в интерфейсе; API может вернуть запись по ID.', correct: false },
        { id: 'server-owner', label: 'На сервере проверить сессию и принадлежность заказа текущему пользователю для каждого запроса.', correct: true },
        { id: 'unguessable-id', label: 'Заменить числовые ID на случайные и считать это достаточной защитой.', correct: false },
      ], explanation: 'Случайный ID снижает угадываемость, но не заменяет проверку доступа. Сервер должен проверять права на каждый объект независимо от интерфейса.' },
      { id: 'coverage', prompt: 'Какой минимальный набор проверок лучше выявит IDOR?', options: [
        { id: 'owner-only', label: 'Владелец читает свой заказ; достаточно проверить только успешный ответ.', correct: false },
        { id: 'change-id', label: 'Проверить чужой ID только в URL страницы, не вызывая API напрямую.', correct: false },
        { id: 'access-matrix', label: 'Сверить владельца, другого пользователя и роль администратора для чтения, изменения и удаления.', correct: true },
      ], explanation: 'Матрица ролей и операций находит ошибки и в чтении, и в изменении данных. Для каждой операции проверяется серверный ответ и отсутствие побочного эффекта.' },
      { id: 'denial', prompt: 'Какой критерий отказа для пользователя B наиболее безопасен?', options: [
        { id: 'deny-no-data', label: 'Вернуть согласованный 403 или 404 без полей заказа и убедиться, что состояние не изменилось.', correct: true },
        { id: 'empty-success', label: 'Вернуть 200 с полным заказом, но попросить интерфейс его не показывать.', correct: false },
        { id: 'generic-500', label: 'Вернуть 500: так клиент не узнает, существует ли заказ.', correct: false },
      ], explanation: 'Выбранный контракт может скрывать существование объекта через 404 или явно запрещать доступ через 403. Важно не вернуть защищённые данные и не менять объект.' },
      { id: 'evidence', prompt: 'Что приложить к дефекту, не создавая утечку персональных данных?', options: [
        { id: 'real-payload', label: 'Полный ответ production с именем, адресом и токеном для воспроизведения.', correct: false },
        { id: 'synthetic-proof', label: 'Синтетические аккаунты A/B, обезличенный запрос, статус, фрагмент безопасного ответа и фактическое влияние.', correct: true },
        { id: 'screenshot-only', label: 'Скриншот без запроса, роли и ожидаемого результата.', correct: false },
      ], explanation: 'Синтетические данные позволяют повторить дефект и показывают границу доступа. Секреты и реальные персональные данные нельзя помещать в отчёт.' },
    ],
  },
  {
    id: 'payment-webhook',
    category: 'INTEGRATION TESTING · MIDDLE',
    title: 'Платёжный callback пришёл дважды',
    brief: 'Платёжный провайдер повторно доставляет webhook после таймаута. Первый запрос уже отметил заказ оплаченным, второй создаёт повторное списание и два письма. Спроектируй надёжную проверку интеграции.',
    deliverable: 'Набор интеграционных проверок повтора и частичного отказа',
    artifact: {
      title: 'План интеграционных проверок webhook',
      prompt: 'Запиши проверки для одинакового event ID, таймаута после commit и временной ошибки очереди. Укажи ключ идемпотентности, точки проверки состояния и контролируемые зависимости.',
      placeholder: 'Сценарий | Действие | Проверка состояния\nПовтор event ID | Доставить событие дважды с тем же idempotency key | Одна транзакция и один переход заказа\nTimeout после commit | Повторить с исходным ключом | Состояние сверяется, второй эффект не создан\nОчередь недоступна | Проверить retry/backoff и запись события в изолированной БД',
      rules: [
        { id: 'event-id', label: 'Повтор использует тот же event ID или idempotency key', pattern: /(event\s*id|id события|идентификатор события|idempotency|идемпотент)/i },
        { id: 'retry', label: 'Проверяются повторная доставка и/или timeout', pattern: /(повтор|retry|дубликат|timeout|таймаут)/i },
        { id: 'single-effect', label: 'Проверяется ровно один бизнес-эффект', pattern: /(один|одна|ровно\s*1|count\s*=?\s*1|one\s+(transaction|effect)|без повтор)/i },
        { id: 'integration-boundary', label: 'Описана проверка состояния БД, очереди или провайдера', pattern: /(бд|database|очеред|queue|провайдер|provider|состояни)/i },
      ],
    },
    tasks: [
      { id: 'idempotency', prompt: 'Как проверить повтор одного и того же события оплаты?', options: [
        { id: 'retry-unbounded', label: 'Отправить callback несколько раз и убедиться, что каждый вернул 200.', correct: false },
        { id: 'same-event-once', label: 'Дважды отправить один event ID и проверить один переход заказа, одно списание и одно бизнес-событие.', correct: true },
        { id: 'different-events', label: 'Для каждого повтора генерировать новый ID, чтобы запросы отличались.', correct: false },
      ], explanation: 'Повторная доставка сохраняет идентификатор события. Проверяем отсутствие повторного бизнес-эффекта, а не только HTTP-статус.' },
      { id: 'test-boundary', prompt: 'Какой тест лучше проверяет взаимодействие обработчика с хранилищем и очередью?', options: [
        { id: 'all-mocked', label: 'Заменить обработчик, БД и очередь заглушками; проверить только, что функция вызвала mock.', correct: false },
        { id: 'real-production', label: 'Послать callback в production и удалить созданные там заказы вручную.', correct: false },
        { id: 'controlled-integration', label: 'Запустить обработчик с изолированной тестовой БД и контролируемой очередью, оставив реальную транзакционную логику.', correct: true },
      ], explanation: 'Интеграционный тест должен включать важные границы взаимодействия, но использовать изолированные данные и контролируемую внешнюю зависимость.' },
      { id: 'timeout', prompt: 'Провайдер получил таймаут, хотя запись заказа могла зафиксироваться. Что проверить?', options: [
        { id: 'retry-same-key', label: 'Повтор с тем же ключом безопасен: операция не дублируется, а система возвращает фактическое состояние.', correct: true },
        { id: 'new-payment', label: 'Создать новую оплату с новым ключом при каждом таймауте.', correct: false },
        { id: 'assume-failed', label: 'Считать любой таймаут доказательством отката транзакции.', correct: false },
      ], explanation: 'Таймаут не говорит, завершилась ли операция на удалённой стороне. Идемпотентный ключ и последующая сверка состояния делают повтор безопасным.' },
      { id: 'diagnostics', prompt: 'Какие данные помогут найти место сбоя при повторной доставке?', options: [
        { id: 'correlation', label: 'Корреляционный ID, event ID, состояние заказа до/после и число попыток без секретов.', correct: true },
        { id: 'raw-secret', label: 'Полный webhook с подписью и секретным токеном в открытом логе.', correct: false },
        { id: 'timestamp-only', label: 'Только время ответа сервера без связи между запросами.', correct: false },
      ], explanation: 'Корреляционные поля связывают попытки и изменения состояния. Подписи, токены и платёжные данные должны быть удалены или замаскированы.' },
    ],
  },
  {
    id: 'ci-quality-gate',
    category: 'TEST AUTOMATION · MIDDLE',
    title: 'Нестабильный checkout в CI',
    brief: 'UI-тест оплаты иногда падает только в CI: он ждёт фиксированные пять секунд, использует общий аккаунт и ищет кнопку CSS-селектором. Подготовь устойчивую стратегию автоматизации.',
    deliverable: 'План тестовой пирамиды, изоляции данных и диагностики CI',
    artifact: {
      title: 'План quality gate для CI',
      prompt: 'Подготовь короткий план CI: уровни проверок, изоляция данных, устойчивый locator, ожидание состояния и артефакты диагностики падения.',
      placeholder: '1. Unit: скидки и граничные значения; API/integration: контракт checkout; небольшой E2E smoke\n2. Fixture создаёт уникальный user/order ID и удаляет только собственные данные\n3. Кнопка ищется по role/name, тест ждёт статус «Оплачено», не использует sleep\n4. На падении сохраняются trace, request ID и безопасные логи без токенов',
      rules: [
        { id: 'levels', label: 'Разделяет unit, integration/API и E2E уровни', pattern: /(unit|юнит)/i, and: /(integration|интеграц|api)/i, andAlso: /(e2e|end.to.end)/i },
        { id: 'fixtures', label: 'Изолирует данные с уникальной fixture/test ID и безопасной очисткой', pattern: /(fixture|фикстур|изолир)/i, and: /(уникал|unique|test\s*id)/i },
        { id: 'locator', label: 'Использует семантический locator или доступное имя', pattern: /(role|роль|доступн(ое|ому) имя|accessible name|locator)/i },
        { id: 'wait-trace', label: 'Ждёт состояние и собирает trace/лог вместо фиксированного sleep', pattern: /(состояни|state|ожидан|жд|wait)/i, and: /(trace|трасс|лог)/i, andAlso: /(sleep|пауз|таймаут)/i },
      ],
    },
    tasks: [
      { id: 'test-levels', prompt: 'Как распределить проверки расчёта скидки и критичного checkout-пути?', options: [
        { id: 'all-e2e', label: 'Проверить все скидки только полными UI E2E, чтобы тест был максимально реалистичным.', correct: false },
        { id: 'balanced', label: 'Правила расчёта покрыть быстрыми unit/API тестами, а несколько критичных пользовательских переходов — E2E.', correct: true },
        { id: 'manual-only', label: 'Оставить CI только сборку; поведение проверить вручную перед релизом.', correct: false },
      ], explanation: 'Быстрые уровни дают точную диагностику логики; небольшое число E2E подтверждает ключевые переходы через реальные границы UI.' },
      { id: 'locator', prompt: 'Чем заменить хрупкий CSS-путь к кнопке оплаты?', options: [
        { id: 'role-name', label: 'Устойчивым доступным locator по роли кнопки и имени «Оплатить».', correct: true },
        { id: 'long-css', label: 'Более длинным CSS-селектором с индексами вложенных элементов.', correct: false },
        { id: 'position', label: 'Координатами кнопки на экране.', correct: false },
      ], explanation: 'Семантический locator ближе к пользовательскому интерфейсу, проверяет доступное имя и устойчив к внутренней перестройке DOM.' },
      { id: 'test-data', prompt: 'Как устранить конфликт из-за общего аккаунта при параллельном запуске?', options: [
        { id: 'shared-reset', label: 'Перед каждым тестом очищать общий аккаунт, пока остальные тесты ждут.', correct: false },
        { id: 'unique-fixture', label: 'Создавать изолированные тестовые данные через fixture с уникальным ID и удалять только созданные записи.', correct: true },
        { id: 'serial', label: 'Отключить все assertions и запускать тесты только последовательно.', correct: false },
      ], explanation: 'Изоляция данных делает тесты повторяемыми и безопасными при параллельном CI. Очистка должна затрагивать только ресурсы конкретного запуска.' },
      { id: 'flaky-diagnosis', prompt: 'Тест периодически падает на ожидании результата. Что сделать сначала?', options: [
        { id: 'increase-sleep', label: 'Увеличить sleep до 15 секунд и несколько раз повторить тест.', correct: false },
        { id: 'hide-retries', label: 'Отключить отчёт о падениях, чтобы CI не блокировал merge.', correct: false },
        { id: 'wait-state-trace', label: 'Ждать конкретного состояния интерфейса, сохранить trace/логи и выяснить источник гонки или медленного ответа.', correct: true },
      ], explanation: 'Фиксированная пауза маскирует, но не устраняет гонку. Состояние и trace показывают, на каком переходе нарушается ожидание.' },
    ],
  },
]

export function scoreProject(project, answers) {
  if (!project || !answers || typeof answers !== 'object') return { score: 0, correct: 0, total: 0, complete: false }
  const correct = project.tasks.filter((task) => {
    const choice = task.options.find(({ id }) => id === answers[task.id])
    return choice?.correct === true
  }).length
  const total = project.tasks.length
  return { score: total ? Math.round(correct * 100 / total) : 0, correct, total, complete: project.tasks.every((task) => task.options.some(({ id }) => id === answers[task.id])) }
}

export function evaluateProjectArtifact(project, text) {
  if (!project?.artifact || typeof text !== 'string') return []
  const value = text.trim().slice(0, 5_000)
  return project.artifact.rules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: value.length >= 40 && rule.pattern.test(value)
      && (!rule.and || rule.and.test(value))
      && (!rule.andAlso || rule.andAlso.test(value)),
  }))
}
