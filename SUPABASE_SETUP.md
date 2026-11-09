# Настройка Supabase для QA на пальцах

## Текущее состояние

Клиент, migration, повторяемый seed и две Edge Functions подготовлены. Supabase CLI/SQL migrations и функции в существующий проект отсюда не применялись: в workspace нет Supabase CLI, Deno, Git remote и подтверждённой сессии Dashboard. До завершения шагов ниже Telegram cloud mode не активен. Обычный браузер продолжает работать в локальном режиме.

Не используйте ключ с префиксом `sb_secret_` в клиенте или GitHub Variables. Он не является Project URL. Этот ключ и отправленный в чат токен бота нужно немедленно отозвать/перевыпустить в соответствующих Dashboard, так как они были раскрыты вне secret store. В проекте эти значения не добавлены.

## 1. Найти Project URL и publishable key

1. В Supabase Dashboard откройте нужный проект.
2. Откройте **Project Settings → API** (в новом интерфейсе раздел может называться **API Keys**).
3. Скопируйте **Project URL** вида `https://<project-ref>.supabase.co`.
4. В секции ключей скопируйте только **Publishable key** (`sb_publishable_...`) или legacy **anon/public** key. Не выбирайте secret/service-role key.
5. Проверенный адрес этого проекта в local ignore-файле задан как `https://txbdivgcltrolmogttpk.supabase.co`; публичный publishable key хранится в `.env.local`, который исключён из Git. Не вставляйте секреты в чат.

## 2. Локальная конфигурация

В корне проекта уже создан локальный `.env.local`. Если на другом компьютере файла нет, скопируйте `.env.example` в `.env.local` и заполните:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

`VITE_SUPABASE_ANON_KEY` также поддерживается для старых проектов. Vite переменные с `VITE_` входят в bundle: здесь допустим только publishable/anon key. Никогда не добавляйте `sb_secret_...`, service-role key, database password или bot token в `.env`, GitHub Variables, HTML или JavaScript. Изменения `.env.local` требуют перезапуска Vite.

## 3. Применить миграцию

Требуются Node.js 22.18+ и Supabase CLI. Авторизуйтесь в собственном терминале VS Code, не передавая access token помощнику:

```sh
npx supabase login
npx supabase link --project-ref txbdivgcltrolmogttpk
npx supabase db push --dry-run
npx supabase db push
```

Проверьте вывод dry-run и список миграций перед применением. Миграция создаёт `profiles`, `questions`, `user_progress`, `quiz_sessions`, `quiz_attempts`, `daily_task_templates`, `daily_tasks` и `daily_task_completions`. Одноразовая auth nonce таблица не используется намеренно: свежий Telegram initData может повторно приходить при безопасном reload в пределах freshness window. Миграция включает RLS, отзывает browser table privileges и открывает RPC только `service_role`.

В Dashboard откройте **SQL Editor**, проверьте структуру и убедитесь, что у `anon`/`authenticated` нет прямых прав на приватные таблицы. RLS без публичных policies намеренно запрещает клиентский доступ; Edge Functions используют service-role клиент только после проверки своей подписанной сессии и сами связывают каждую операцию с проверенным user ID.

## 4. Импортировать исходные вопросы

Импорт воспроизводим и использует исходные `src/data/questions.js` и `src/data/dailyTasks.js`, не переписывает текст и stable IDs:

```sh
npm run supabase:seed
```

Команда генерирует `supabase/seed.sql` с upsert по стабильным ID. Откройте этот файл, скопируйте SQL в **Supabase Dashboard → SQL Editor → New query** и нажмите **Run**. Повторный запуск обновляет строки с тем же ID, не создавая копий. Проверка количества:

```sql
select count(*) from public.questions where is_active;
select count(*) from public.daily_task_templates where is_active;
```

Ожидается 30 и 30. `daily_tasks` создаются Edge Function для текущей UTC-даты из одного из 30 шаблонов; функция делает upsert по `task_date`, поэтому все пользователи получают один task этого дня.

## 5. Добавить Edge Function secrets

Сначала в **@BotFather** отзовите раскрытый ранее bot token и создайте новый. В Supabase Dashboard откройте **Project Settings → Edge Functions → Secrets** (или **Edge Functions → Secrets**) и добавьте:

- `TELEGRAM_BOT_TOKEN` — только новый токен от BotFather.
- `TELEGRAM_SESSION_SECRET` — случайная строка минимум 32 байта, сгенерируйте её локально, например `openssl rand -hex 32`, и вставьте прямо в Dashboard.
- `ALLOWED_ORIGINS` — точный HTTPS origin опубликованного приложения без пути, например `https://<ваш-github-pages-host>`; можно перечислить origins через запятую. `localhost:5173` разрешён только для разработки.
- `TELEGRAM_ADMIN_IDS` — comma-separated Telegram numeric user IDs, которым разрешена AI-панель. Получите ID из подтверждённого профиля `public.profiles` после входа в Mini App. Не берите ID из непроверенного клиентского запроса.
- `OPENROUTER_API_KEY` — ключ только в Supabase Edge Function Secrets; не передавайте его в Vite, GitHub Variables, SQL, браузер или чат. После раскрытия предыдущий ключ нужно отозвать и создать новый.
- Необязательно: `PUBLIC_APP_URL` — фактический публичный HTTPS URL приложения для OpenRouter attribution.
- Необязательно: `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=3600`.

AI gateway фиксирует `google/gemma-4-31b-it:free` как генератор и `nvidia/nemotron-3.5-super-vl:free` как независимый reviewer. Перед вызовом функция сверяет обе точные модели с публичным OpenRouter catalog и требует нулевую цену prompt/completion; при недоступности запрос прекращается без платного fallback. Лимит — 5 генераций в час на admin ID, максимум 2 revision. Reviewer получает формулировку и варианты, но не correctOptionId, explanation или hint. Одобренный черновик всё равно не попадёт в банк, пока администратор вручную не нажмёт «Опубликовать».

Не передавайте secret значения в переписку и не включайте debug logging полного request body, `initData` или profile payload. Edge Function создаёт `SUPABASE_SERVICE_ROLE_KEY` из защищённого серверного окружения Supabase; код не читает этот ключ из браузера и не требует его вручную копировать в проект.

## 6. Развернуть Edge Functions

После `supabase link` и настройки Dashboard secrets:

```sh
npx supabase functions deploy telegram-auth --no-verify-jwt
npx supabase functions deploy quiz-api --no-verify-jwt
npx supabase functions deploy ai-admin --no-verify-jwt
```

`--no-verify-jwt` здесь обязателен: Supabase JWT проверка отключена потому, что приложение использует отдельный короткоживущий HMAC token, выданный `telegram-auth` после Telegram HMAC validation. `quiz-api` и `ai-admin` сами проверяют подпись, `iss`, `iat`, `exp` и извлекают identity; клиент не отправляет user ID. `ai-admin` дополнительно сверяет ID с `TELEGRAM_ADMIN_IDS`. Не добавляйте публичный route в функцию, обходящий эту проверку.

В Edge Function настройках проверьте CORS origin. Auth проверяет HMAC по Telegram Web Apps алгоритму, freshness `auth_date`, дубликаты параметров и ограничение длины. Каждый quiz session создаётся сервером, сервер закрепляет за ним вопросы; попытка проверяется по option ID, защищена уникальным attempt ID и ограничением один вопрос на session.

## 7. GitHub Pages variables

Для данного remote откройте **Settings → Secrets and variables → Actions → Variables → New repository variable** и добавьте:

- `VITE_SUPABASE_URL` — Project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — только publishable/anon key.

Оба значения предназначены для браузера; они не являются секретами. Bot token и session signing secret туда не добавляйте. Workflow читает только эти две public Variables и передаёт их build. GitHub Pages сам backend не запускает; Edge Functions остаются в Supabase.

## 8. Локальная проверка

1. Запустите `npm run dev` и откройте локальный адрес в обычном браузере: приложение должно работать локально без Telegram.
2. Для облачной проверки откройте действующий HTTPS Pages URL через кнопку Mini App в Telegram. Browser devtools/обычный браузер не создаёт валидный Telegram initData и не получает cloud scoring.
3. Проверьте DevTools Network: `telegram-auth` должен вернуть короткоживущий access token, `quiz-api` — создать сессию и принять ответ. Не копируйте эти запросы/данные публично.
4. Убедитесь, что неправильный option ID отклоняется сервером, повтор того же attempt ID не начисляет очки второй раз, а профиль показывает серверные цифры.
5. При временной сетевой ошибке попытка остаётся в ограниченном local outbox и повторно отправляется при восстановлении сети/возврате вкладки либо вручную; повтор использует тот же attempt ID, и ответ не начисляется повторно.

## 9. BotFather и production Telegram Mini App

1. В @BotFather выберите созданного бота, затем **Bot Settings → Configure Mini App** (или **Main App**) и назначьте только URL, который GitHub показал после успешного Pages deployment.
2. Используйте `/setmenubutton`, выберите бота и задайте текст кнопки и тот же URL.
3. Проверьте разрешённый origin в `ALLOWED_ORIGINS`; origin — схема и host, без `/qa_easy/` path.
4. Откройте app в Telegram на iOS/Android/Desktop. Проверьте light/dark theme, safe area, viewport, BackButton, ежедневную задачу и одну server-scored попытку.
5. Проверьте Supabase **Edge Function Logs** и **Table Editor**: не должно быть `initData`, bot token или session token в logs; должны появиться profile, quiz session, attempt и progress.

Нельзя подтвердить production до того, как этот пользователь сам создаст commit/push и workflow завершится успешно. В текущем workspace git metadata нет; push не выполнялся.

## 10. Резервное копирование и восстановление

- В Dashboard откройте **Database → Backups** и проверьте включённый план хранения для своего Supabase тарифа. Скачайте актуальный backup перед ручным изменением схемы.
- Для логического экспорта используйте Supabase CLI `db dump` после link/auth; храните дамп в закрытом месте вне репозитория и проверьте, что он не добавлен через `git status`.
- Восстанавливайте backup только в согласованное окно обслуживания после проверки target project/ref. Восстановление может заменить текущее состояние и является разрушительной операцией.
- Восстановление вопросов без user data: повторно выполните идемпотентный seed SQL.

## Ручные действия

1. Отозвать скомпрометированный bot token и Supabase secret key; не менять publishable key только из-за публичного назначения, но проверить настройки проекта.
2. Войти в Supabase CLI, связать локальную папку с проектом и применить миграцию после dry-run.
3. Выполнить `npm run supabase:seed`, применить `supabase/seed.sql` в SQL Editor и проверить counts.
6. Задать Edge Function secrets, allowed origin, новый OpenRouter key и `TELEGRAM_ADMIN_IDS` в Supabase Dashboard.
7. Развернуть три Edge Functions и проверить их логи без записи token/prompt.
6. Добавить две Supabase public Variables в GitHub Actions settings.
7. Создать commit/push в существующую GitHub-репозиторию и дождаться Pages deployment.
8. Назначить фактический HTTPS URL в BotFather и проверить Mini App на реальном Telegram client.