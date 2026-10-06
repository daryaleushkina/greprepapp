# Сверка с первоисточниками

Дата сверки: 29 сентября 2026. Версии: `@tma.js/sdk` 3.3.0 (14.07.2026),
`@tma.js/sdk-react` 3.0.23, `@tma.js/bridge` 2.3.3; Bot API 10.3, последнее
изменение Mini Apps API — 10.1 (11.06.2026). `@telegram-apps/sdk` — 3.11.8,
последнее изменение 05.12.2025.

Как проверялось: текст core.telegram.org/bots/webapps и api-changelog;
markdown-исходники docs.telegram-mini-apps.com; `.d.ts` и собранный код
пакетов из npm; `telegram-web-app.js`. Код навыка (`assets/*`) собран
`tsc --strict --noUncheckedIndexedAccess` и `vite build` и запущен в Chromium
через Playwright с подменой окружения.

При обновлении SDK пересверять в первую очередь: имена CSS-переменных
`bindCssVars`, форму `ifAvailable()`, асинхронность `mount`.

## Подтверждено

| Утверждение | Источник |
| --- | --- |
| 15 ключей themeParams, все необязательные, с версиями (secondary_bg 6.1; header_bg, accent_text, section_bg, section_header_text, subtitle_text, destructive_text 7.0; section_separator 7.6; bottom_bar_bg 7.10) | webapps → ThemeParams |
| Событие `themeChanged` без параметров, новые значения — в `themeParams`/`colorScheme` | webapps → Events |
| `safeAreaInset`, `contentSafeAreaInset`, события `safeAreaChanged`/`contentSafeAreaChanged` — Bot API 8.0 | webapps, changelog 8.0 |
| `viewportStableHeight` не меняется во время жестов; для прижатия к низу — он, а не `viewportHeight` | webapps → viewportHeight |
| SecondaryButton, `secondaryButtonClicked`, `setBottomBarColor`, `bottom_bar_bg_color` — 7.10; MainButton переименован в BottomButton | changelog 7.10 |
| `position` вторичной: left (по умолч.) / right / top / bottom, только при обеих видимых | webapps → BottomButton |
| Текст по умолчанию: «Continue» / «Cancel» | webapps → BottomButton |
| `iconCustomEmojiId` у кнопок — 9.5 | webapps, Recent changes |
| `disableVerticalSwipes`/`enableVerticalSwipes` — 7.7; рекомендовано оставлять включёнными; шапкой свернуть можно всегда | webapps |
| DeviceStorage (5 МБ) и SecureStorage (10 значений, Keychain/Keystore) — 9.0 | webapps, changelog 9.0 |
| CloudStorage — 6.9, 1024 ключа, ключ 1–128 `A-Za-z0-9_-`, значение 0–4096 | webapps → CloudStorage |
| `setHeaderColor` — 6.1, произвольный цвет — 6.9; `setBottomBarColor` на Android красит панель навигации | webapps |
| В полноэкранном режиме шапка прозрачна, но её цвет задавать всё равно | webapps → requestFullscreen |
| `openLink` — только в ответ на действие человека | webapps → openLink |
| `selectionChanged` не для подтверждения выбора | webapps → HapticFeedback |
| MainButton скрыта при запуске из меню вложений до взаимодействия | webapps → BottomButton.show |
| initData пуста при запуске с клавиатурной кнопки и из инлайн-режима | webapps → WebAppInitData |
| Попап: заголовок 0–64, текст 1–256, кнопок 1–3 | webapps → PopupParams |
| `hideKeyboard` — 9.1 | webapps |
| Класс производительности Android в User-Agent, совет упрощать анимации на LOW | webapps → Additional Data in User-Agent |
| HTTP без TLS — только в тестовом окружении | webapps → Testing |
| Ставить только `@tma.js/sdk-react`, он реэкспортирует SDK; оба сразу — ошибки | docs tma.js → usage-tips, sdk-react |
| `isAvailable()` проверяет среду, init, версию, монтирование; `ifAvailable()` → `{ ok, data }` | docs tma.js, `withChecksFp.d.ts` |
| `onClick` у кнопок возвращает отписку | `BackButton.d.ts`, `MainButton.d.ts`, docs |
| `themeParams.mount()` до `miniApp` и кнопок | docs tma.js → mini-app, main-button, secondary-button |
| `viewport.mount()` асинхронный, без таймаута по умолчанию; на desktop/web берёт `window.inner*` | исходник 3.3.0 |
| Переменные `bindCssVars`: `--tg-theme-*`; `--tg-bg-color`, `--tg-header-color`, `--tg-bottom-bar-color`; `--tg-viewport-{height,width,stable-height}`, `--tg-viewport-safe-area-inset-*`, `--tg-viewport-content-safe-area-inset-*` | исходник 3.3.0 + проверка в браузере |
| `--tg-color-scheme` и `--tg-safe-area-inset-*` ставит только telegram-web-app.js | `telegram-web-app.js` + проверка в браузере |
| `mockTelegramEnv` + `emitEvent` — официальный способ подмены | docs tma.js → bridge/environment |
| `cloudStorage.getItem` отдаёт `''` для отсутствующего ключа | исходник 3.3.0 |
| `validate` из `@tma.js/init-data-node` по умолчанию отвергает данные старше суток; `/web` — для Web Crypto | docs tma.js → init-data-node/validating |

## Не подтверждено — помечено в тексте

| Утверждение | Где помечено | Почему не подтверждено |
| --- | --- | --- |
| `env(safe-area-inset-*)` = 0 внутри iOS-клиента | SKILL, safe-area | issue #1377 открыт, подтверждения только от сообщества |
| Верхний отступ = safe + content | SKILL, safe-area, telegram.css | документация не говорит явно |
| Ключ темы в `setHeaderColor` сам следует за сменой темы | theme-and-colors | обещано в tma.js только для фона |
| Поведение `macOS`-клиента (не отвечает на запрос темы) | platforms | только комментарий в шаблоне tma.js |
| `stableHeight = 0` на старте, если первый ответ неустойчивый | safe-area | видно в исходнике, на устройстве не наблюдалось |
| Цвет полей формы при несовпадении темы Telegram и ОС | theme-and-colors | вывод из устройства `color-scheme` в CSS |
| Лицензии Figma-китов | native-look | по данным поиска |

## Выкинуто

Список — в `platforms.md`, раздел «Не подтверждено»: квоты хранилища и WebGL
по платформам, цепочка сертификатов iOS, автоследование Android за
`color-scheme`, кэш URL после смены туннеля, эвристика клавиатуры 15%,
системная «назад» Android.

## Расхождения исходных навыков с первоисточниками

### victorzhuk / z-ts-telegram-mini-app

1. **Имена переменных отступов.** Навык: `viewport.bindCssVars()` создаёт
   `--tg-safe-area-inset-*` и `--tg-content-safe-area-inset-*`. На деле
   @tma.js/sdk 3.x создаёт `--tg-viewport-safe-area-inset-*` и
   `--tg-viewport-content-safe-area-inset-*` (исходник + браузер). Код по
   навыку молча получает 0.
2. **`--tg-color-scheme`.** Навык: её отслеживает `themeParams.bindCssVars()`.
   @tma.js/sdk её не создаёт; это переменная telegram-web-app.js.
3. **Запуск.** Навык зовёт `viewport.mount()` синхронно и сразу проверяет
   `viewport.bindCssVars.isAvailable()`. `mount` асинхронный — до его
   завершения компонент не смонтирован, и привязка переменных пропускается.
4. **Отступ снизу** `max(env(safe-area-inset-bottom), var(--tg-content-safe-area-inset-bottom))`:
   смешивает системный отступ с отступом интерфейса Telegram, опирается на
   `env()`, который в iOS-клиенте по сообщениям 0, и берёт имя переменной не
   от @tma.js/sdk.
5. **MainButton «на iOS скрыта в меню вложений до `/start`».** Документация:
   скрыта при запуске из меню вложений до взаимодействия с интерфейсом,
   без платформы и `/start`.
6. **`<meta name="color-scheme">` для тёмной темы на iOS.** Отдаёт схему ОС,
   а не Telegram; в документации Telegram не упоминается.
7. **Таблица платформ** (квоты, WebGL, сертификаты, Chromium ~119+) — без
   источников.
8. Мелочи: `@telegram-apps/sdk` последний релиз — декабрь 2025, а не октябрь;
   `@tma.js/sdk` уже 3.3, а не 3.2.

### yaniv-golan / telegram-webapps-skill

1. **SettingsButton — «шестерёнка в шапке».** Документация: пункт «Настройки»
   в контекстном меню мини-аппа.
2. **SecondaryButton «над MainButton»** (SKILL.md). Документация: по
   умолчанию слева; сверху — только при `position: 'top'`. Их же
   `ux-patterns.md` пишет «слева» — навык противоречит сам себе.
3. **«14 CSS-переменных темы»** (`theme.css`). Ключей 15: пропущен
   `section_separator_color` (7.6).
4. **«`viewport-fit=cover` нужен, чтобы работали переменные safe area».**
   Переменные Telegram ставит JS, мета на них не влияет; мета нужна только
   для `env()`.
5. **«Переменные темы только для чтения, запись не действует».** Записать
   можно; её перезапишет следующее событие темы.
6. **Мок подменяет `window.Telegram.WebApp`** — с @tma.js/sdk не работает;
   версия в моке — 9.0, актуальная Mini Apps API — 10.1.
7. **Эвристика клавиатуры «сжатие на 15%»** — без источника.
8. **SecondaryButton «для двух равноправных действий»** против victorzhuk
   «не для равноправного». Документация не решает; навык выбрал иерархию
   (вторичная — для второстепенного), это правило проекта, а не факт.
9. Подтвердилось: накопление обработчиков BackButton, `openLink` только из
   жеста, лимиты хранилищ, SecondaryButton с 7.10, `pre_checkout_query` —
   к нам не относится (оплаты в навыке нет).

### Документация tma.js против самого пакета

- `migrate-from-telegram-apps.md`: `miniApp.bottomBarColor` переименован в
  `bottomBarBgColor`. В `.d.ts` 3.3.0 сигнал по-прежнему `bottomBarColor`
  (`bottomBarColorRgb`). Верить типам.
- `viewport.md`: `bindCssVars` создаёт только высоту/ширину. Исходник
  создаёт ещё восемь переменных отступов.
- Пример `mockTelegramEnv` в документации кладёт `auth_date` в миллисекундах
  (`Date.now()`); в initData это секунды — в `mockEnv.ts` исправлено.
