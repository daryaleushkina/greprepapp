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
  `telegram-mini-app/scripts/check.sh`;
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

## 3. Боевая база: выгрузка и накат миграций

Когда появится боевая Supabase — перенести из audioguide `tools/db/backup.sh`
с `.github/workflows/backup.yml` (своя суточная выгрузка с проверкой
восстановлением: на бесплатном плане нет восстановления «на момент до
ошибки», а суточный снимок откатывает базу целиком) и `tools/db/apply_prod.sh`
(миграции в прод — только после прогона на чистой локальной базе с SQL-тестами
и сверки сигнатур функций, которые зовёт Worker). Сейчас не перенесены: они
завязаны на боевую базу и пути audioguide, проверить их не на чем.

## 4. Контент заданий

Банк заданий и порядок их подготовки по правилам `CLAUDE.md` («Контент
заданий»): свои тексты, независимая проверка ключа, два источника на факт,
проверка Даши. Возможно — свой скилл под этот порядок, как `research` в
audioguide.

## 5. Мобильное приложение

Стек и правила — когда дойдёт; за основу — audioguide (Expo, Reanimated,
FlashList, jest, Maestro). Скиллы `animate-expo` и `react-native-skills` уже
лежат.
