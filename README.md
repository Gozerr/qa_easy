# QA на пальцах

Мобильный тренажёр для начинающих и практикующих тестировщиков. Короткая теория, вопросы с разбором, практические сценарии, подготовка к собеседованию и одно общее задание QA Daily на каждый UTC-день.

## Требования

- Node.js 22.18+ (в CI используется Node.js 24)
- npm 11+
- Git для публикации в GitHub
- Проект Supabase для Telegram cloud mode; без него приложение остаётся рабочим локально

Фронтенд статический. Проверка Telegram initData и серверный подсчёт попыток выполняются только Supabase Edge Functions. Bot token и session signing secret не находятся в Vite или браузере.

## Локальный запуск

```sh
npm ci
npm run dev
```

Откройте адрес, который напечатает Vite, обычно `http://localhost:5173`. В обычном браузере приложение запускается без Telegram и использует системную цветовую схему. Для production-сборки выполните `npm run build`, для локального просмотра собранной версии — `npm run preview`.

Для Supabase скопируйте `.env.example` в `.env.local` (если файла ещё нет) и задайте `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`. Не кладите в Vite-переменные Supabase secret/service-role key или токен бота. Подробная настройка описана в [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Проверки

```sh
npm test
npm run build
npm run test:e2e
npm audit
npm run supabase:seed
```

Unit-тесты проверяют Fisher–Yates, ID-ответы, schema валидацию контента, миграцию storage, Supabase config/response validation, HMAC initData, срок сессии и RLS SQL invariants. Playwright проверяет Daily, фильтр и уровни, reset, XSS-like query, malformed storage и отсутствие переполнения на 320/360/390/768/1280px в обеих темах. При первом запуске E2E установите браузер `npx playwright install chromium`. Отдельная lint-команда не настроена.

## Содержание и логика

- `src/data/questions.js` — 30 вопросов: по 10 на основы QA, Web/API и практические сценарии. Каждый вопрос имеет стабильный ID, категорию, сложность, варианты со своими ID, правильный ID, объяснение и при необходимости подсказку.
- `src/data/theory.js` — короткие объяснения, примеры и ссылки на проверочные вопросы.
- `src/data/dailyTasks.js` — 30 формулировок QA Daily, связанных с вопросами по ID.
- `src/lib/quizEngine.js` — перемешивание вопросов и вариантов, создание сессии и проверка ответов.
- `src/lib/dailyTask.js` — UTC-дата и одинаковый для всех пользователей выбор задания.
- `src/lib/progressStorage.js` — версия схемы localStorage и безопасная обработка отсутствующих или повреждённых данных.
- `src/composables/useProgress.js` — очки, ответы, ежедневная серия, достижения и сохранённые сессии.
- `src/lib/supabaseClient.js` и `src/lib/cloudApi.js` — необязательный Supabase-клиент, проверка config/response и HTTPS вызовы Edge Functions.
- `supabase/migrations/` — закрытая схема БД, RLS и транзакционные RPC.
- `supabase/functions/` — Telegram initData verification, короткоживущая server session, protected quiz API и AI admin gateway.
- `supabase/functions/ai-admin/` — server-only OpenRouter workflow: Gemma free generation, blind Nemotron review, bounded revisions и ручная публикация администратором.
- `src/views/AiAdminView.vue` — доступная только allowlisted Telegram IDs панель AI-черновиков; новые вопросы не публикуются автоматически.

### Как добавить вопрос

Добавьте объект в `src/data/questions.js` с уникальным `id`, одной из категорий `fundamentals`, `web-api`, `scenarios`, уровнем `difficulty`, текстом `question`, массивом `options` с уникальными строковыми `id`, полем `correctOptionId`, объяснением и необязательной подсказкой. Для собеседования задайте `interviewLevel: 'junior'` или `'middle'`. Не используйте номер или букву варианта для проверки: порядок вариантов перемешивается.

Если добавляется вопрос в одну из трёх основных категорий, обновите соответствующие проверки количества в `src/lib/quizEngine.test.js`. Если нужно, добавьте его ID в `src/data/theory.js` или `src/data/dailyTasks.js`.

### Как изменить QA Daily

Отредактируйте или добавьте пару `title` и `prompt` в `taskPrompts` в `src/data/dailyTasks.js`. Задание автоматически связывается с вопросом той же позиции в `questions`; сохраняйте порядок соответствий либо перепишите `dailyTasks` явными объектами с `questionId`. Индекс вычисляется как номер календарного дня UTC по модулю размера банка. При неизменном банке одна и та же дата всегда даёт одно и то же задание всем пользователям; цикл повторяется после 30 дней. Проверка выполняется по UTC, а не по местному часовому поясу.

## GitHub Pages

В workspace нет `.git`, remote или локальной default branch. Пользователь предоставил существующий remote `https://github.com/Gozerr/qa_easy.git`, но push не выполнялся. Workflow берёт repository name/default branch из GitHub Actions, выставляет Vite base для GitHub Pages и публикует только default branch; третьи-party Actions закреплены по commit SHA. Проверки запускаются для push/PR, публикация не запускается из PR.

1. В терминале VS Code откройте `g:\qa_easy`, проверьте `git status` и создайте первый commit.

   ```sh
   git add .
   git commit -m "Создать QA на пальцах"
   git remote add origin https://github.com/Gozerr/qa_easy.git
   git push -u origin <ИМЯ_ВЕТКИ>
   ```

2. Если remote ещё не добавлен, выполните `git remote add origin https://github.com/Gozerr/qa_easy.git`; затем отправьте commit в существующую default branch.
3. Если default branch в GitHub отличается от ветки, которую вы отправили, назначьте нужную ветку default: **Settings → General → Default branch → Edit**. Workflow проверяет значение GitHub, поэтому имя ветки в YAML менять не нужно.
4. Откройте **Settings → Pages**, в разделе **Build and deployment** выберите **Source: GitHub Actions**.
5. Если включаете Supabase, добавьте только публичные repository Variables `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` в **Settings → Secrets and variables → Actions → Variables**.
6. Откройте вкладку **Actions** и дождитесь успешного workflow **Проверка и публикация** на default branch. Только после этого GitHub покажет фактический адрес страницы в окружении `github-pages`.

### Если публикация не прошла

- **404 после успешного workflow:** проверьте, что в **Settings → Pages → Source** выбрано **GitHub Actions**, и откройте именно URL из environment `github-pages`. Для пользовательского репозитория `USERNAME.github.io` base будет `/`, для обычного — `/REPOSITORY/`.
- **Workflow проверяет ветку, но не публикует:** публикация намеренно ограничена default branch. Посмотрите текущее значение в **Settings → General → Default branch** и отправьте коммит именно туда.
- **`npm ci` завершился ошибкой:** убедитесь, что закоммичен `package-lock.json`; локально используйте Node.js 22.18 или новее.
- **404 после перехода по внутренней ссылке:** приложение использует HTML5-маршруты, а `npm run build` создаёт fallback `dist/404.html`. Убедитесь, что собираете текущую версию workflow и открываете URL из environment `github-pages`.

## Подключение Telegram

В приложении используется `@tma.js/sdk-vue`. Telegram WebApp theme/viewport/BackButton используются при наличии окружения. Raw `initData` отправляется только в `telegram-auth`; функция проверяет HMAC, свежесть `auth_date`, выводит identity из проверенного payload и возвращает короткоживущую подпись. `initDataUnsafe` и user ID из браузера не считаются доказательством identity. В обычном браузере приложение использует локальный режим.

Для подключения своего бота после публикации:

1. Откройте официальный **@BotFather** в Telegram и отправьте `/newbot`.
2. Следуйте подсказкам, задайте имя и уникальный username. Токен бота нужен только для настройки BotFather; не добавляйте его в проект, браузер или `.env`.
3. В BotFather выберите созданного бота, откройте **Bot Settings → Configure Mini App** (либо **Main App**, если этот пункт показан) и укажите фактический HTTPS URL GitHub Pages.
4. Для кнопки меню используйте `/setmenubutton`, выберите бота и задайте текст кнопки и тот же URL приложения.
5. Откройте ссылку из Telegram и проверьте тему, высоту viewport и BackButton. Для локального тестирования можно использовать официальную тестовую среду Telegram и защищённый публичный туннель к dev-серверу.

Edge Functions пока не развёрнуты в Supabase, bot token должен быть заново выпущен после раскрытия в чате и добавлен только в Supabase secrets. Пока ручная настройка не завершена, cloud scoring недоступен. Официальные руководства: [Telegram Mini Apps](https://core.telegram.org/bots/webapps), [SDK](https://docs.telegram-mini-apps.com/packages/tma-js-sdk) и [Vue bindings](https://docs.telegram-mini-apps.com/packages/tma-js-sdk-vue).

## Ограничения MVP

- До настройки Supabase прогресс хранится в localStorage текущего браузера/WebView и не синхронизируется между устройствами.
- При настроенных Supabase и Telegram статистика/ответы записываются через Edge Functions; клиентские localStorage values остаются изменяемым кэшем и не являются авторитетом.
- Подписанный initData остаётся bearer payload в пределах короткого `auth_date` freshness window; для quiz attempts действует отдельная server-side idempotency и уникальность user/session/question.
- Даже с cloud mode нет абсолютной защиты от автоматизации или кражи свежего Telegram launch payload; ограничения описаны в [SECURITY.md](SECURITY.md).
- Темы и задания встроены в исходный код и обновляются вместе с новой публикацией.
- В локальном режиме баллы клиентские, изменяемые и не подходят для рейтинга/подтверждения квалификации.

## Security

Threat model, подтверждённые ограничения и отчёт проверки находятся в [SECURITY.md](SECURITY.md) и [SECURITY_AUDIT.md](SECURITY_AUDIT.md). GitHub Pages не позволяет установить полноценные HTTP headers на origin; CSP в HTML meta — только дополнительная защита.
