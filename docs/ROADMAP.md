# GrePrepApp — что делаем крупно

## 1. Каркас — первая задача

Мини-апп Telegram (React + Vite), Cloudflare Worker и Supabase одним
приложением, по образцу LifeCommit. Вместе с ним переезжает всё, что держит
правила `CLAUDE.md`, — без этого правило «фича без теста в прод не уходит»
нечем проверять:

- тесты: vitest с порогом покрытия, Playwright (iPhone/WebKit и
  Android/Chromium, обе темы), `checkScreen`, фикстура `me`, `seed.ts`,
  заглушки `tg` и `net`;
- гейт перед продом: хуки `pre-push` и `commit-msg`, GitHub Actions с деплоем;
- хуки Claude `block-no-verify` и `protect-gates`;
- панель ревью, «злой пользователь» и проход по кнопкам — агенты и команды по
  образцу `lc-*`, переписанные под этот проект;
- тест на `.claude/hooks/git-author.sh`.

## 2. Документ дизайна и токены

После первых экранов — `/impeccable document` (или seed-режим до кода) и
токены. До этого решить, откуда цвета: тема Telegram или свои hex (задача в
Issues).

## 3. Контент заданий

Банк заданий и порядок их подготовки по правилам `CLAUDE.md` («Контент
заданий»): свои тексты, независимая проверка ключа, два источника на факт,
проверка Даши. Возможно — свой скилл под этот порядок, как `research` в
audioguide.

## 4. Мобильное приложение

Стек и правила — когда дойдёт; за основу — audioguide (Expo, Reanimated,
FlashList, jest, Maestro). Скиллы `animate-expo` и `react-native-skills` уже
лежат.
