export const detectiveCases = [
  {
    id: 'double-charge', progressId: 'detective-double-charge', title: 'Двойное списание после таймаута', difficulty: 'Junior+',
    prompt: 'Поддержка сообщает: «Клиент не увидел подтверждение оплаты, нажал повторить и получил два списания». Разберись в цепочке, выбери проверку, установи вероятную причину и собери баг-репорт.',
    probes: [
      { id: 'payment-logs', label: 'Логи платёжных попыток и transaction ID после timeout.', useful: true },
      { id: 'button-color', label: 'Цвет и отступ кнопки подтверждения оплаты.', useful: false },
      { id: 'browser-cache', label: 'Состояние cache браузера на устройстве клиента.', useful: false },
    ],
    evidence: [
      '10:14:03 POST /payments · order=ord-203 · idempotency_key=null · response=504',
      '10:14:08 POST /payments · order=ord-203 · idempotency_key=null · response=201',
      'provider transactions: txn-881 = 1 200 ₽, txn-882 = 1 200 ₽',
    ],
    usefulEvidence: 'Обе попытки дошли до провайдера, ключ идемпотентности отсутствует, transaction ID разные.',
    limitedEvidence: 'Ты не запросил логи транзакций. Доступно только сообщение пользователя и общий статус заказа.',
    causes: [
      { id: 'missing-idempotency', label: 'Повторный запрос не был идемпотентным, провайдер создал вторую транзакцию.' },
      { id: 'bank-error', label: 'Банк отобразил одно списание дважды, хотя сервис создал один платёж.' },
      { id: 'stale-ui', label: 'Интерфейс показал устаревший статус, серверный платёж только один.' },
    ], correctCauseId: 'missing-idempotency',
    tests: [
      { id: 'same-idempotency-key', title: 'Повторить оплату после таймаута с тем же idempotency key', relevant: true },
      { id: 'duplicate-callback', title: 'Повторно доставить callback платежа и проверить единственное списание', relevant: true },
      { id: 'clear-cache', title: 'Очистить cache и сравнить цвета кнопки оплаты', relevant: false },
      { id: 'change-browser', title: 'Повторить один запрос в другом браузере без сравнения transaction ID', relevant: false },
    ], expectedTests: ['same-idempotency-key', 'duplicate-callback'],
  },
  {
    id: 'idor-order', progressId: 'detective-idor-order', title: 'Чужой адрес в карточке заказа', difficulty: 'Middle',
    prompt: 'Пользователь заметил, что после замены номера заказа в запросе API открывается карточка другого клиента вместе с адресом доставки. Найди источник утечки и определи границы проверки.',
    probes: [
      { id: 'access-logs', label: 'Сравнить actor ID, владельца заказа и ответы API для двух аккаунтов.', useful: true },
      { id: 'layout-screenshot', label: 'Сравнить отступы карточек заказа в разных браузерах.', useful: false },
      { id: 'cache-reset', label: 'Очистить локальный cache пользователя и повторить вход.', useful: false },
    ],
    evidence: [
      'GET /api/orders/782 · actor=user-A · owner=user-B · status=200',
      'response fields: orderId, shippingAddress, recipientName',
      'authorization check: session valid · resource ownership check: skipped',
    ],
    usefulEvidence: 'Сессия действительна, но владелец заказа другой; API возвращает адрес и имя без проверки права на объект.',
    limitedEvidence: 'Без actor ID и владельца нельзя понять, проверяет ли API право пользователя на конкретный заказ.',
    causes: [
      { id: 'missing-owner-check', label: 'Сервер проверяет только вход в систему, но не владельца запрошенного заказа.' },
      { id: 'stale-cache', label: 'Браузер показывает старую карточку из локального cache.' },
      { id: 'bad-format', label: 'Чужой адрес отображается из-за ошибки форматирования ответа.' },
    ], correctCauseId: 'missing-owner-check',
    tests: [
      { id: 'owner-matrix', title: 'Сравнить владельца, другого пользователя и администратора на чтение и изменение', relevant: true },
      { id: 'response-leak', title: 'Проверить отсутствие полей заказа в отказе и неизменность данных', relevant: true },
      { id: 'css-responsive', title: 'Проверить ширину карточки заказа на мобильном экране', relevant: false },
      { id: 'guess-random-id', title: 'Считать случайный идентификатор достаточным контролем доступа', relevant: false },
    ], expectedTests: ['owner-matrix', 'response-leak'],
  },
  {
    id: 'duplicate-notice', progressId: 'detective-duplicate-notice', title: 'Уведомление отправляется повторно', difficulty: 'Middle',
    prompt: 'После временного отказа почтового сервиса очередь повторила событие, и клиент получил два письма об одной доставке. Исследуй границу между очередью и обработчиком события.',
    probes: [
      { id: 'queue-trace', label: 'Сопоставить event ID, попытки доставки, ACK и записи обработчика.', useful: true },
      { id: 'email-style', label: 'Сравнить шрифт и цвет повторившихся писем.', useful: false },
      { id: 'device-settings', label: 'Попросить клиента проверить настройки почтового приложения.', useful: false },
    ],
    evidence: [
      'event_id=evt-551 · delivery=1 · mail_provider=503 · ACK=missing',
      'event_id=evt-551 · delivery=2 · mail_provider=202 · ACK=sent',
      'handler has no processed-event record; both deliveries queued email',
    ],
    usefulEvidence: 'Обе попытки используют тот же event ID; первая завершилась без ACK, а обработчик не запоминает уже применённые события.',
    limitedEvidence: 'Без истории очереди нельзя отличить повтор одной доставки от двух самостоятельных событий.',
    causes: [
      { id: 'no-dedupe', label: 'Обработчик не дедуплицирует повторно доставленное событие по event ID.' },
      { id: 'user-rule', label: 'Клиент подписался на два разных типа писем о доставке.' },
      { id: 'mail-css', label: 'Почтовый сервис визуально продублировал одно сохранённое письмо.' },
    ], correctCauseId: 'no-dedupe',
    tests: [
      { id: 'redeliver-event', title: 'Доставить один event ID повторно и проверить одно бизнес-уведомление', relevant: true },
      { id: 'ack-failure', title: 'Проверить ACK после отказа провайдера и повтор с ограничением попыток', relevant: true },
      { id: 'new-event-id', title: 'Выдавать новый event ID каждому повтору и считать их независимыми событиями', relevant: false },
      { id: 'email-layout', title: 'Сравнить оформление письма в двух почтовых клиентах', relevant: false },
    ], expectedTests: ['redeliver-event', 'ack-failure'],
  },
]
