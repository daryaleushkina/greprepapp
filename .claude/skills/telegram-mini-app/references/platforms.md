# Отличия платформ

Только то, что подтверждено документацией Telegram, docs.telegram-mini-apps.com
или исходником @tma.js/sdk. Всё, что в исходных навыках было без источника,
вынесено вниз в «Не подтверждено».

## Идентификатор платформы

`retrieveLaunchParams().tgWebAppPlatform`: `android`, `ios`, `macos`,
`tdesktop`, `weba`, `web` (Web K), встречаются и `webk`, `unigram`, `unknown`
(список в исходнике @tma.js/sdk). Ветвиться по нему — для вида (iOS- или
Material-подобный элемент), а не для возможностей: возможность проверяется
`isAvailable()` / `supports()`.

## Что отличается

| | iOS | Android | Desktop / macOS / Web |
| --- | --- | --- | --- |
| Окно | нижняя шторка, половинная или развёрнутая | так же | сразу развёрнуто, `expand()` ничего не делает |
| Размеры в @tma.js/sdk | запрос `web_app_request_viewport` к клиенту | так же | `window.innerHeight/innerWidth` |
| `env(safe-area-inset-*)` | по сообщениям — 0 (issue Telegram-iOS#1377) | — | — |
| Нижняя панель | — | `setBottomBarColor` красит и системную панель навигации | — |
| Данные об устройстве | — | в User-Agent: `Telegram-Android/<версия> (<производитель> <модель>; Android <версия>; SDK <n>; LOW\|AVERAGE\|HIGH)` | — |
| Отладка | Safari → Develop → устройство | `chrome://inspect/#devices` | см. ниже |

**Класс производительности Android.** Telegram прямо советует упрощать
анимации и эффекты на `LOW`. В @tma.js/sdk-react — `useAndroidDeviceData()`,
поле `performanceClass`. Это единственный случай, где ветвиться по устройству
рекомендует сама документация.

**macOS-клиент.** Официальный шаблон tma.js подменяет для него часть моста:
по их комментарию клиент иногда не отвечает на `web_app_request_theme` и шлёт
неверное событие на `web_app_request_safe_area`. Со стороны Telegram это не
подтверждено; если на macOS тема или отступы не приходят — смотреть
`src/init.ts` шаблона github.com/Telegram-Mini-Apps/reactjs-template.

## Отладка на устройстве

- **iOS:** Telegram → 10 раз нажать на «Настройки» → Allow Web View Inspection
  (по документации Telegram; tma.js описывает путь через настройки Safari на
  iPhone). Телефон по кабелю к Mac, Safari → Develop → устройство → WebView
  мини-аппа. Без Mac — Eruda (консоль внутри страницы, `npm i eruda`, включать
  только в dev или по `startapp=debug`).
- **Android:** включить отладку по USB; Telegram → Настройки → в самом низу
  дважды долгое нажатие на номер версии → Enable WebView Debug;
  `chrome://inspect/#devices`.
- **Telegram Desktop (Windows, Linux):** бета-версия → Settings → Advanced →
  Experimental settings → Enable webview inspection; правый клик → Inspect.
- **Telegram macOS:** бета-версия → 5 раз быстро по иконке настроек → Debug
  Mini Apps; правый клик → Inspect Element.

## Тестовое окружение Telegram

Отдельные сервера со своими аккаунтами и своим @BotFather. Там мини-апп можно
открыть по HTTP без TLS (документация) — удобно, пока нет туннеля. Вход:
iOS — 10 нажатий на «Настройки» → Accounts → Login to another account → Test;
Desktop — Settings, Shift+Alt+правый клик по «Add Account» → Test Server;
macOS — 10 нажатий на «Настройки» → ⌘+клик по «Add Account». Бот там —
другой, с другим токеном: проверка initData на сервере должна знать, какой
токен ждать.

В обычном окружении URL мини-аппа — только HTTPS.

## Не подтверждено (было в исходных навыках, первоисточником не найдено)

Не писать в коде и документах как факт; проверять на устройстве, если станет
важно.

- iOS WKWebView «требует полную цепочку сертификатов».
- Квоты хранилища WebView: «~5 МБ на iOS, ~50 МБ на Android».
- WebGL 2.0 «выключен на iOS, экспериментален на Android».
- Android WebView «сам следует `color-scheme`», iOS «требует meta».
- MainButton «на iOS скрыта в меню вложений до `/start`». В документации
  иначе: скрыта при запуске из меню вложений до первого взаимодействия с
  интерфейсом, без привязки к платформе и `/start`.
- Клиенты «кэшируют старый URL мини-аппа после смены туннеля».
- Эвристика «клавиатура открыта, если высота сжалась на 15%».
- Системная «назад» Android вызывает BackButton.
