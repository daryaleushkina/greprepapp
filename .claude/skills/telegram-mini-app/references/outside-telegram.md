# Вне Telegram: разработка, скриншоты, проверки

## Почему подменяется мост, а не `window.Telegram`

@tma.js/sdk не читает `window.Telegram.WebApp`. Он берёт параметры запуска
из адреса/`sessionStorage`, а методы шлёт через `window.TelegramWebviewProxy.postEvent`
(мобильные и десктоп) или `postMessage` родителю (веб-клиенты) и ждёт ответных
событий. Поэтому моки старого образца — как `miniapp-mock.js` у
yaniv-golan, который подменяет `window.Telegram.WebApp`, — с @tma.js/sdk не
работают. Официальный способ — `mockTelegramEnv` из самого SDK: он кладёт
параметры запуска и ставит свой `TelegramWebviewProxy`, а ответы на запросы
приложение отдаёт через `emitEvent` (docs.telegram-mini-apps.com →
@tma.js/bridge → Environment).

## assets/mockEnv.ts

Копируется в `src/telegram/mockEnv.ts`, вызывается из точки входа:

```ts
if (import.meta.env.DEV) {
  const { mockTelegramEnvForDev } = await import('./telegram/mockEnv');
  await mockTelegramEnvForDev();
}
```

Что умеет:

- Определяет «не Telegram» через `isTMA('complete')` — настоящий запрос с
  ожиданием ответа. Простой `isTMA()` после первой подмены ошибся бы: он
  находит параметры в `sessionStorage` и считает, что мы в Telegram.
- Отвечает на запросы темы, размеров, safe area и content safe area — без
  этого `viewport.mount()` на `ios`/`android` ждёт ответа бесконечно.
- Рисует **заглушки нативных элементов** в DOM: нижнюю панель с главной и
  вторичной кнопками (учитывает `position`, цвета, лоадер, выключенность) и
  «‹ Назад». Клик по ним шлёт `main_button_pressed` / `secondary_button_pressed`
  / `back_button_pressed`; Escape — «назад», когда кнопка видна. Когда
  панель видна, видимая высота уменьшается на её высоту (58 px, 109 px при
  вертикальной паре — размеры отладочной панели из telegram-web-app.js), —
  так вёрстка ведёт себя как над настоящей панелью.
- Отвечает на попапы (выбирает первую не-отменяющую кнопку, чтобы промис не
  повис), `openLink` открывает вкладку.
- CloudStorage и DeviceStorage — поверх `localStorage`, SecureStorage — поверх
  `sessionStorage`, с префиксами `tg-mock-*`.
- Не эмулирует: оплату (`invoice`), биометрию, геолокацию, датчики, QR,
  полноэкранный режим. Такие вызовы уходят в `console.debug` и остаются без
  ответа: у промисов SDK нет таймаута по умолчанию, они повиснут, если не
  передать `{ timeout }`.

Параметры в адресе страницы:

| Параметр | Значения | Зачем |
| --- | --- | --- |
| `tgTheme` | `dark` (умолч.), `light` | обе темы |
| `tgPlatform` | `ios` (умолч.), `android`, `tdesktop`, `macos`, `weba`, `web` | путь инициализации viewport и вид |
| `tgVersion` | `10.1` (умолч.) | ниже 7.10 — проверить, что без SecondaryButton экран жив |
| `tgInsets` | `safeTop,safeBottom,contentTop,contentBottom` в px | вырез и шапка полноэкранного режима |
| `tgChrome` | `0` | снимок без заглушек |
| `tgStart` | строка | `start_param` для глубоких ссылок |

Значения отступов **не выдуманы в моке нарочно**: снять настоящие с
устройства (в Safari Inspector или Eruda: `viewport.safeAreaInsets()`,
`viewport.contentSafeAreaInsets()` в полноэкранном и обычном режиме) и
записать рядом со скриншотами.

Подменная тема: тёмная — из примера документации tma.js (реальная тема
Telegram Desktop), светлая — из мока yaniv-golan, с клиентом не сверена. В
тёмной нет `bottom_bar_bg_color` и `section_separator_color` — это заодно
проверка запасных значений. Для точного совпадения — снять
`themeParams.state()` с устройства и подставить.

initData в подмене **не пройдёт проверку подписи**. Для работы с настоящим
сервером локально — либо отдельный dev-режим проверки на сервере (только в
dev!), либо настоящая строка initData, снятая с устройства (`retrieveRawInitData()`
в инспекторе) — она живёт сутки по умолчанию `@tma.js/init-data-node`.

## Сборка не тащит подмену

Условие: импорт `mockEnv.ts` только динамический и только в ветке
`import.meta.env.DEV`. Vite заменяет условие на `false`, ветка и чанк
исчезают. Проверено `vite build`: в `dist` нет ни `tg-mock`, ни
`mockTelegramEnv`, ни hex-цветов подменной темы. Вне Telegram собранное
приложение показывает «Откройте приложение в Telegram».

Проверка после сборки:

```bash
rg -l 'tg-mock|mockTelegramEnv' dist && echo 'подмена попала в сборку'
```

## Скриншоты: scripts/screenshot.mjs

```bash
# dev-сервер уже запущен
node .claude/skills/telegram-mini-app/scripts/screenshot.mjs --url http://localhost:5173/ --out screenshots/tma
node .claude/skills/telegram-mini-app/scripts/screenshot.mjs --url http://localhost:5173/goals --insets 59,34,46,0
```

Снимает светлую и тёмную тему в 390×844 @3x, мобильная эмуляция Chromium,
`ru-RU`. Ждёт, пока появится `--tg-theme-bg-color`, и падает с кодом 1, если
не появилась или на странице были ошибки. Playwright — из `node_modules`
проекта (`playwright` в devDependencies; браузер — `npx playwright install
chromium-headless-shell`).

Скриншот вне Telegram — проверка вёрстки и темы, **не WebView Telegram**:
шрифты, прокрутка, клавиатура, настоящие отступы и панель — только на
устройстве.

## Локально на устройстве

- В обычном окружении Telegram открывает только HTTPS: туннель к dev-серверу
  (например, `cloudflared` или `ngrok`) и его адрес в @BotFather.
- В тестовом окружении Telegram можно HTTP (см. `platforms.md`).
- `vite --host`, чтобы dev-сервер был виден по сети.
