# Откуда взято

Навык написан заново по-русски под @tma.js/sdk 3.x. Из чужих навыков
дословно не перенесено ни одного абзаца; взяты идеи, структура отдельных
разделов и список грабель — и каждое утверждение перепроверено по
первоисточникам (`references/sources.md`). Полные тексты лицензий — в `licenses/`.

## z-ts-telegram-mini-app — victorzhuk/skills, Apache-2.0

github.com/victorzhuk/skills, `skills/typescript/z-ts-telegram-mini-app/SKILL.md`
(коммит dbade3d, 7 июля 2026). © 2026 Victor Zhuk.
Лицензия: `licenses/Apache-2.0-victorzhuk-skills.txt`.

По мотивам (переписано и изменено):

- таблица выбора SDK — сведена к одному варианту `@tma.js/sdk-react`;
- два вида отступов и их переменные — **исправлено**: у @tma.js/sdk имена
  `--tg-viewport-*`, а не `--tg-safe-area-inset-*`;
- MainButton как конечный автомат idle / submitting / blocked;
- хаптика только на итог; подтверждение закрытия только при несохранённом;
  `disableVertical` только по причине;
- `<meta name="color-scheme">` — **заменено** на `color-scheme` из темы
  Telegram (`miniApp.isDark`);
- таблица iOS / Android / Desktop — оставлено только подтверждённое, прочее
  перечислено в «Не подтверждено» `references/platforms.md`;
- раздел «Чего не делать» и проверки через `rg` (`scripts/check.sh` —
  проверки свои).

Изменения относительно оригинала (требование п. 4b Apache-2.0): текст
переведён и переписан, примеры переписаны под @tma.js/sdk 3.3.0, ошибки
исправлены, неподтверждённое убрано или помечено.

## telegram-webapps — yaniv-golan/telegram-webapps-skill, MIT

github.com/yaniv-golan/telegram-webapps-skill (коммит f82df26, 27 апреля
2026). © 2026 Yaniv Golan. Лицензия: `licenses/MIT-yaniv-golan-telegram-webapps-skill.txt`.

По мотивам:

- `assets/miniapp-mock.js` → идеи для `assets/mockEnv.ts`: заглушки
  MainButton/SecondaryButton/BackButton настоящим DOM, Escape как «назад»,
  хранилища поверх `localStorage`/`sessionStorage`, светлая подменная тема
  (значения цветов взяты из их `LIGHT_THEME`). Код переписан: их мок
  подменяет `window.Telegram.WebApp`, а @tma.js/sdk этот объект не читает.
  Сам `miniapp-mock.js` в навык **не положен**: с @tma.js/sdk он не работает.
- `assets/miniapp-native.css` → идея базового слоя `assets/telegram.css`
  (сумма safe + content отступов, тело без прокрутки, без подсветки нажатия);
  hex-запасные заменены системными цветами, имена переменных — на @tma.js/sdk.
- `references/ux-patterns.md` и грабли из `SKILL.md`: накопление обработчиков
  BackButton, `openLink` только из жеста, проверка версии API, лимиты
  хранилищ, SecondaryButton с 7.10. Подтверждённое — оставлено, ошибочное —
  в `references/sources.md`.

## Официальный шаблон tma.js — MIT

github.com/Telegram-Mini-Apps/reactjs-template, `src/mockEnv.ts`, `src/init.ts`.
© 2024 Telegram Mini Apps. Лицензия: `licenses/MIT-telegram-mini-apps-reactjs-template.txt`.

Основа `assets/mockEnv.ts` (схема `isTMA('complete')` → `mockTelegramEnv` с
ответами через `emitEvent`, тёмная подменная тема) и порядок монтирования в
`assets/bootstrap.tsx`.

## Только справочно, текст не брали

- github.com/Rithprohos/telegram-mini-app-skills — лицензия в репозитории не
  указана; использован только как список тем для сверки полноты.

## Первоисточники

- core.telegram.org/bots/webapps (включая Design Guidelines и «Recent changes»)
  и core.telegram.org/bots/api-changelog;
- docs.telegram-mini-apps.com (исходники документации — репозиторий
  Telegram-Mini-Apps/tma.js, `apps/docs`);
- пакеты `@tma.js/sdk` 3.3.0, `@tma.js/sdk-react` 3.0.23, `@tma.js/bridge` 2.3.3
  (типы и собранный код);
- telegram.org/js/telegram-web-app.js (имена CSS-переменных клиента);
- github.com/TelegramMessenger/Telegram-iOS/issues/1377.
