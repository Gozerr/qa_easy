# Безопасность QA на пальцах

## Модель угроз

### Активы

- Секрет Telegram bot token, Supabase service-role key и OpenRouter API key: должны существовать только в Supabase server environment.
- Подтверждённая Telegram identity, allowlisted admin actions, облачные попытки/статистика и AI drafts.
- Банк вопросов, правильные ответы и объяснения.
- Локальный прогресс, выбранная тема и очередь неподтверждённых попыток.
- GitHub Actions credentials и целостность Pages build.

### Границы доверия и точки входа

- GitHub Pages JavaScript, query/path параметры, localStorage и браузерные события полностью контролируются посетителем.
- Telegram WebApp `initData` недоверен до проверки HMAC и `auth_date` в `telegram-auth`.
- Supabase Edge Functions — граница серверной проверки. Service role обходит RLS, поэтому функции выводят user ID только из проверенной custom session и передают его в RPC.
- Supabase migrations/seed — доверенный deployment input; seed генерируется из текущих data modules.
- GitHub Actions получает исходный код pull request без production-deploy шага и секретов; deploy ограничен default branch.

### Возможности атакующего и основные сценарии

- Изменить JS, localStorage, URL и произвольный network request, чтобы подменить счёт, открыть неизвестный маршрут или отправить неверный option ID.
- Передать HTML/JS payload в query, повреждённое сохранённое состояние или некорректный вопрос.
- Повторить network attempt, подменить Telegram user ID, перебрать вопросы или повторно заявить награду.
- Использовать украденный действующий Telegram initData/custom bearer token в пределах срока жизни.
- Внести уязвимость через npm dependency или изменить GitHub workflow/action ref.
- Открыть страницы/картинки с неожидаемого host и раскрыть referrer.

## Реализованные защиты

- Vue выводит вопрос, пояснение и query как текст; пользовательский `v-html`, `innerHTML`, `eval` и dynamic `Function` в приложении не применяются.
- Vue Router не использует query для внешнего redirect; неизвестные пути ведут на локальную 404-страницу.
- Вопросы и ответы валидируются по схеме: уникальные ID, разрешённые категории/сложности, 2–12 вариантов, один существующий correct option ID, размер текстов ограничен.
- Correctness локально сравнивает stable option ID, а cloud correctness рассчитывает PostgreSQL по базе. На клиент cloud mode не передаёт `is_correct`, user ID или score.
- Local storage schema версионирована, migrates v1→v2, ограничена по объёму/коллекциям/счётчикам и проверяет сессию/ID/date. В ней нет bot token, publishable key, initData или server session token.
- Edge auth принимает только raw signed initData, проверяет HMAC, не допускает duplicate query keys, проверяет `auth_date` и user shape. `initDataUnsafe` не используется.
- Custom server token подписан HMAC, живёт не дольше часа и хранится только в памяти JavaScript module.
- Cloud quiz sessions выбирает и сохраняет сервер; RPC проверяет identity, session membership, correct option ID, текущий UTC Daily и уникальность `(user, session, question)`/`(user, attempt_id)`.
- RLS включён на user/data таблицах, права `anon`/`authenticated` отозваны; у них нет permissive policies. Только Edge Functions с service role обращаются к RPC, а RPC проверяет ownership аргумента, полученного из session token.
- Сетевой ответ не начисляется локально до серверного подтверждения. Ограниченный outbox сохраняет только attempt IDs/выбранный option и повторяется при reconnect/возврате вкладки; серверная idempotency сохраняет однократное начисление.
- OpenRouter API key и admin allowlist читаются только Edge Function. AI tables закрыты RLS и доступны service role; генерация требует проверенного Telegram session и `TELEGRAM_ADMIN_IDS`.
- AI gateway допускает только заранее выбранные exact `:free` модели и перед вызовом проверяет их нулевую prompt/completion цену в каталоге. Provider fallback отключён, при недоступности модели workflow завершается ошибкой без результата.
- Nemotron получает только формулировку, варианты, категорию и сложность; он самостоятельно возвращает выбранный option ID. Генератору не сообщается, как reviewer ответил, пока blind review не завершён.
- Сохраняются bounded drafts и события этапов без prompt/API-key logging. До двух revision; публикация доступна только вручную после совпавшего независимого ответа и review approval.
- CSP meta ограничивает script hosts, connection hosts и object/base/form use; Referrer-Policy задана. Google Fonts удалён.
- GitHub Actions используют проверенные commit SHA, минимальные permissions, `npm audit`, unit и Playwright tests; Dependabot проверяет npm и actions.

## Ограничения и предположения

- GitHub remote подключён; опубликована ветка `main` с одним первоначальным коммитом. `.env.local` исключён из Git и не отслеживается. Предшествующей Git-истории в этом workspace нет; отдельно проверьте GitHub Secret scanning после включения функции. Ранее раскрытые в переписке credentials всё равно нужно отозвать, даже если их нет в репозитории.
- Подготовленные Supabase migration/functions не применены к проекту до действий владельца; настоящее cloud behavior начнёт работать только после deploy, secrets, seed и GitHub public variables. Локальный режим остаётся изменяемым пользователем.
- Telegram initData является подписанным bearer payload и может быть повторно использован до истечения freshness window. Повторный launch/reload Mini App штатно может вернуть тот же payload, поэтому одноразовый nonce не включён. Повторные игровые награды защищены отдельной server-side уникальностью.
- Короткоживущий HMAC bearer token можно повторить до `exp`, если он украден из памяти работающего процесса. Он не сохраняется в localStorage/sessionStorage. Для quiz API отдельное rate limiting и token revocation не настроены; AI generation ограничена пятью запросами в час на allowlisted admin ID.
- Cloud score подтверждается сервером, но вопросы и часть локальной практики остаются загруженными в клиент; нельзя предотвратить автоматизированный просмотр контента.
- Для устойчивости к частым запросам до public launch рекомендуется добавить rate limiting per Telegram user/IP и мониторинг аномальных попыток.
- GitHub Pages не даёт выставить произвольные HTTP headers. Meta CSP не заменяет HTTP `Content-Security-Policy`, `frame-ancestors`, HSTS, Permissions-Policy или `X-Content-Type-Options`. Для строгих headers понадобится CDN/reverse proxy или хостинг с настройкой headers.
- CSP включает `'unsafe-inline'` в `style-src` из-за Vue динамических style attributes. Inline JavaScript запрещён, но nonce-based CSP потребует другой серверной настройки.
- Внешний официальный `telegram-web-app.js` разрешён в CSP и является runtime dependency Telegram. Репутация/целостность этого CDN — внешняя зависимость.
- Нет отдельной backend privacy/retention policy и нет автоматического удаления Telegram профилей; пользователь может сбросить свою учебную статистику из интерфейса.

## Сообщение об уязвимости

Не публикуйте рабочие токены, Telegram initData, user IDs, SQL dumps или exploit details в публичном issue. Если GitHub Security Advisories включены для репозитория, используйте **Security → Advisories → Report a vulnerability**. Иначе сообщите владельцу репозитория приватным каналом и приложите минимальный воспроизводимый сценарий, затронутую версию и влияние. Не проверяйте проблему на чужих Telegram аккаунтах или production данных.

## Реагирование на инцидент

1. Отозвать bot token в BotFather, Supabase secret/service-role keys и `TELEGRAM_SESSION_SECRET`; выпустить новые значения.
2. При необходимости остановить Edge Functions или временно выключить cloud Variables в GitHub.
3. Сохранить только необходимые журналы без initData/token, определить период и набор затронутых user records.
4. Проверить последние изменения/деплой, восстановить БД из проверенного backup при подтверждённом повреждении.
5. Развернуть исправление, проверить auth/score/reset tests и снова включить функции.
6. Сообщить пользователям о подтверждённом влиянии без публикации секретных данных.