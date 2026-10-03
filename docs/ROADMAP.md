# GrePrepApp — что делаем крупно

## 1. Каркас — первая задача

Мини-апп Telegram (React + Vite), Cloudflare Worker и Supabase одним
приложением, по образцу LifeCommit. Хуки, CI, агенты ревью, скрипты бота и
линтер уже лежат и ждут кода; вместе с каркасом нужно:

- тесты: vitest с порогом покрытия, Playwright (iPhone/WebKit и
  Android/Chromium, обе темы), `checkScreen`, фикстура `me`, `seed.ts`,
  заглушки `tg` и `net`; из LifeCommit же — `scripts/e2e-coverage.mjs` и
  нагрузка `scripts/load.js` (k6, только локальный стенд);
- `package.json` со скриптами, на которые опираются хуки и CI (`typecheck`,
  `lint`, `coverage`, `e2e`, `build`, `db:start`), и `check:tma` для
  `telegram-mini-app/scripts/check.sh`; `packageManager` с версией pnpm и
  `.node-version` (22);
- из LifeCommit же: `e2e/a11y.spec.ts` (axe, WCAG AA), `tsconfig.{e2e,worker,workertest}.json`,
  `supabase/config.toml` со своим диапазоном портов (чтобы не драться с
  LifeCommit и audioguide на одном Маке — `docs/HANDOFF.md`, «Грабли»);
- журнал запросов: одна строка лога на запрос, `cf-ray` в ответ как
  `x-request-id`, ошибки клиента — в таблицу `client_errors` (по образцу
  audioguide): логи Workers живут трое суток и сэмплируются;
- `docs/TESTING.md` по образцу audioguide: слои тестов, что подменяется, честный
  раздел «что не покрыто»;
- прогнать в нём тесты хуков (`.claude/hooks/*.test.ts`,
  `scripts/hooks/git-hooks.test.ts`) и дописать тест на
  `.claude/hooks/session-git.sh`;
- проект Cloudflare и Supabase, секреты `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID` и переменная `DEPLOY_ENABLED=true` в GitHub —
  последним шагом, когда гейт зелёный;
- бот: имя и тексты (`TEXTS` в `scripts/setup-bot.mjs`) — решение Даши.

## 2. Документ дизайна и токены

После первых экранов — `/impeccable document` (или seed-режим до кода) и
токены. До этого решить, откуда цвета: тема Telegram или свои hex (задача в
Issues).

## 3. Боевая база: сторожа и выгрузка

Когда появится боевая Supabase — перенести из audioguide (сейчас проверить их
не на чем):

- `supabase/tests/exposure.sql` — сторож «анониму не видно ничего нашего»:
  облако раздаёт `anon` права шире, чем локальный CLI;
- `tools/db/rpc_contract.sh` — сторож имён аргументов функций, которые зовёт
  Worker; безопасен и на бою;
- `tools/db/schema_inventory.sql` и `compare_schema.py` — сверка схемы боя с
  репозиторием напрямую, а не по журналу миграций;
- `tools/db/gen_types.sh` — типы схемы через временный файл;
- `tools/db/backup.sh` и `.github/workflows/backup.yml` — своя суточная
  выгрузка с проверкой восстановлением (на бесплатном плане нет восстановления
  «на момент до ошибки»); раннер — GitHub, не свой: репозиторий публичный.

**Не переносить `tools/db/apply_prod.sh`**: в audioguide он запрещён — написан
до склейки миграций и портит журнал. Порядок наката — в `docs/HANDOFF.md`
(«Supabase»): до вливания, совместимо со старым кодом.

## 4. Контент заданий

Банк заданий и порядок их подготовки по правилам `CLAUDE.md` («Контент
заданий»): свои тексты, независимая проверка ключа, два источника на факт,
проверка Даши. Возможно — свой скилл под этот порядок, как `research` в
audioguide. Если ответы или объяснения будет готовить или проверять модель —
эталоны промпта на настоящей модели, каждый случай трижды, как `pnpm
eval:voice` в LifeCommit (`vitest.eval.config.ts`).

## 5. Мобильное приложение

Стек и правила — когда дойдёт; за основу — audioguide (Expo, Reanimated,
FlashList, jest, Maestro); оттуда же — тестовая обвязка `apps/mobile/test/`,
плагины облегчённой и подписанной сборки, `tools/mobile/release_apk.sh`.
Скиллы `animate-expo` и `react-native-skills` уже лежат.
