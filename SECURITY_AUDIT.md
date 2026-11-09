# Отчёт аудита безопасности

**Область:** текущий статический Vue/Vite workspace, Supabase migrations и Edge Function source, OpenRouter gateway, GitHub Actions, client storage и quiz logic. **Дата проверки:** 9 ноября 2026. **Важно:** remote Supabase и GitHub не подключались, миграции/функции не развертывались; live OpenRouter inference не выполнялся.

## Краткий риск-статус

Клиентская поверхность укреплена: schema/size bounds, текстовый рендер, fallback navigation, CSP meta, строгий quiz ID flow и расширенные тесты. Серверный проект подготовлен, но cloud protection не действует в production, пока владелец не применит миграцию, импортирует seed, развернёт функции и задаст secrets. Локальные баллы не являются доверенными.

## Находки

### SEC-01 — Секретные credentials раскрыты в переписке

- **Критичность:** Critical, если присланные значения действительны.
- **Статус:** подтверждено присутствие секретоподобных Supabase secret key и Telegram bot token в пользовательском сообщении; сами значения в source files не добавлялись и здесь не повторяются.
- **Затронутые файлы:** вне репозитория/исходников; credential выставлен в разговоре.
- **Воспроизведение:** секрет прислан как обычный текст, а не через secret manager.
- **Риск:** доступ к функциям/данным с правами бота или service role в зависимости от соответствующего токена.
- **Решение:** эти значения не использовались. Немедленно revoke/regenerate bot token в BotFather и Supabase secret key в Dashboard; проверьте audit logs. Publishable key предназначен для браузера, но проверьте его RLS scope.
- **Проверка:** source-интеграция использует только Vite publishable key; в local env лежат только Project URL и publishable key, `.env.local` находится в `.gitignore`.
- **Остаток:** revoke не выполнен помощником и требует владельца аккаунтов.

### SEC-02 — Client-owned localStorage scores

- **Критичность:** Medium в local mode; это ограничение архитектуры, не серверная уязвимость.
- **Затронутые файлы:** `src/lib/progressStorage.js`, `src/composables/useProgress.js`, profile/dashboard.
- **Воспроизведение:** изменить `qa-na-paltsakh:progress` через DevTools и перезагрузить страницу.
- **Риск:** подмена XP, completion и достижений на собственном устройстве.
- **Решение:** local schema/version/size/integer/ID/date validation; профиль помечает local statistics как изменяемые; при cloud auth counters заменяются server result.
- **Проверка:** unit migration/corruption tests и E2E persistence/reset tests.
- **Остаток:** без настроенного backend client-only score не authoritative.

### SEC-03 — Supabase protection пока не активирована

- **Критичность:** High для заявленной cloud identity/scoring до deployment; сейчас никакое пользовательское облачное чтение/начисление не доступно.
- **Затронутые файлы:** `supabase/migrations/20261109000000_qa_training.sql`, `supabase/functions/telegram-auth/index.ts`, `supabase/functions/quiz-api/index.ts`, `.env.local`.
- **Воспроизведение:** в workspace нет Supabase CLI login/configuration, функции и миграция не были отправлены в project; backend requests завершатся ошибкой/локальный браузер останется local mode.
- **Решение:** реализованы RLS-deny-by-default, HMAC initData verification, short-lived server token, server-picked session, RPC correctness/idempotency and per-user reset.
- **Проверка:** unit tests подписывают test-only initData и проверяют auth_date/tampering/session expiry; SQL migration static test проверяет RLS/revoke/unique constraints.
- **Остаток:** нужен владелец Supabase, новый BotFather token, secret setup, migration/seed/functions deployment и GitHub Variables.

### SEC-07 — OpenRouter AI gateway и ручная публикация

- **Критичность:** High до deployment/secret rotation; Medium после корректной настройки allowlist и функций.
- **Реализация:** отдельная Edge Function проверяет HMAC session и `TELEGRAM_ADMIN_IDS`; ключ `OPENROUTER_API_KEY` читается только на сервере. AI таблицы закрыты RLS. Генератор и reviewer фиксированы на согласованных exact `:free` IDs; перед inference catalog проверяет нулевую цену prompt/completion, а provider fallback выключен.
- **Проверка содержимого:** Gemma возвращает bounded JSON с четырьмя вариантами; Nemotron получает вопрос и варианты без expected answer/explanation/hint и независимо выбирает option ID. Допускаются максимум две revisions. Только совпавший reviewer answer и approval переводят draft в approved; затем требуется отдельная ручная публикация. Лимит генерации — 5 в час на admin ID.
- **Тесты:** unit проверяют схемы и blind payload; static boundary tests проверяют RLS, allowlist, модели, no fallback, revision cap и publish gate.
- **Остаток:** live inference не тестировался и ключ OpenRouter не использовался, поскольку был раскрыт в сообщении; владелец должен отозвать его, создать новый secret, задать admin IDs и развернуть миграцию/function. Без этого AI gateway не работает.

### SEC-04 — Повтор свежего initData и bearer session window

- **Критичность:** Medium.
- **Затронутые файлы:** `supabase/functions/_shared/telegramAuth.ts`, `supabase/functions/_shared/sessionToken.ts`, `supabase/functions/telegram-auth/index.ts`.
- **Риск:** валидный Telegram initData можно повторно передавать до часа; украденный HMAC token можно использовать до истечения (1 час).
- **Причина дизайна:** одноразовый initData nonce ломает обычный reload Mini App, где Telegram может повторно отдать ту же launch data. Секретный token не сохраняется в browser storage.
- **Компенсация:** freshness, HMAC, HTTPS, ограниченная длина, token `iss/iat/exp`, уникальные attempts и user/session/question constraints.
- **Остаток:** можно добавить rate limiting, device-bound refresh protocol или серверные сессии с revocation в отдельной итерации.

### SEC-05 — GitHub Pages не контролирует HTTP security headers

- **Критичность:** Low/Medium defense-in-depth.
- **Затронутые файлы:** `index.html`, `.github/workflows/deploy.yml`.
- **Решение:** CSP/referrer meta, локальный font stack, ограниченный script/connect source list и pinned action SHAs.
- **Остаток:** CSP meta не может выставить `frame-ancestors`, HSTS, `X-Content-Type-Options` и прочие HTTP headers. `style-src 'unsafe-inline'` разрешён для Vue dynamic style; Telegram CDN оставлен доверенным runtime script.

### SEC-06 — Git history и remote невозможно проверить

- **Критичность:** неизвестно.
- **Факт:** `g:\qa_easy\.git` отсутствует, поэтому secret scanning и author/remotes audit по Git history невозможны.
- **Действие:** после создания/привязки repository выполните GitHub secret scanning и проверьте историю. Если credentials когда-либо попадали в историю, удаление commit не заменяет rotation.

## Исправления и тестовые доказательства

- Unit tests включают content/schema, local storage bounds/migration, Supabase config/response validation, Telegram HMAC/freshness/tampering, custom session signature/expiry, AI schema/blind reviewer payload, admin allowlist/RLS and publish invariants.
- Playwright E2E tests покрывают Daily persistence, Junior/Middle, theory, theme/reset, malformed localStorage/XSS-like query, reset focus и responsive layout для нескольких viewport widths × themes.
- Production build после UI/Supabase changes проходил ранее; финальный повтор всех команд указан в итоговом статусе.
- `npm audit` проверяется отдельно; известные advisories на момент последней проверки были нулевыми.
- Supabase migration/Edge deployment не выполнялись, потому что требуются Dashboard credentials и явное внешнее действие пользователя.

## Приоритет перед публичным запуском

1. Немедленно отозвать раскрытые bot token и Supabase secret key.
2. Применить migration, импортировать seed, задать новый BotFather token/session secret/origin и deploy Edge Functions.
3. Настроить GitHub public Variables, deploy Pages и подключить URL в BotFather.
4. Проверить production Telegram launch, server-side attempt duplicate handling, reset и RLS deny by default.
5. Добавить rate limits/abuse monitoring и проверенный backup/restore runbook.
6. При необходимости строгих HTTP security headers перейти на CDN/reverse proxy, который позволяет задать headers.