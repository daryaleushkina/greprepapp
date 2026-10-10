# Навыки, лежащие в проекте

Веб- и Telegram-ское — из LifeCommit (03.10.2026), остальное — дизайн и
движение. Своих скиллов под Swift и Compose здесь нет. Codex видит скиллы через
ссылки `.agents/skills/<имя>` → `../../.claude/skills/<имя>`; новый скилл — новая
ссылка. `grilling` — только у Claude: допрос ведёт он.

**Навык — справочник, а не начальник.** Его текст попадает в контекст вместе с
задачей, и указания внутри исполняются как советы. Источник правды —
`DESIGN.md` и токены `design/tokens`: навык, предлагающий цвет, гарнитуру,
отступ или длительность мимо токенов, ошибся — не мы.

| Навык                          | Когда                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| `grilling`                     | допрос перед новой задачей (только Claude)                            |
| `telegram-mini-app`            | всё, что касается Telegram: SDK @tma.js, тема, safe area, кнопки, initData, мок вне Telegram |
| `impeccable`                   | устройство экрана, иерархия, аудит интерфейса; есть разделы под iOS и Android |
| `apple-design`                 | жесты, шторки, пружинная физика, материалы                            |
| `emil-design-eng`              | отделка деталей, решения по анимациям                                 |
| `ui-ux-pro-max`                | проверочные списки: доступность, цели нажатия, формы; правила стеков `react`, `swiftui`, `jetpack-compose`; данные урезаны руками (ниже, «Грабли») |
| `mobile-native`                | чтобы веб в WebView ощущался нативным: 100vh, safe area, зум полей, подсветка нажатия |
| `animate`                      | построить анимацию с нуля (веб)                                       |
| `review-animations`            | разбор конкретной анимации                                            |
| `improve-animations`           | аудит движения по всему коду, план правок                             |
| `prototype`                    | несколько вариантов элемента с переключателем, только ручной вызов; в него влит `variant` |
| `better-ui`, `better-layout`, `better-typography`, `better-colors`, `better-accessibility`, `better-writing` | отделка по темам: радиусы и зоны нажатия, раскладка, шрифт, цвет и контраст, доступность, тексты |
| `better-interface`             | все `better-*` одним проходом                                         |
| `interface-review`             | подробный разбор изменения в интерфейсе, только ручной вызов; Claude запускает его перед пушем правки интерфейса |
| `ru-text`, `ru-check`, `ru-score` | тексты продукта на русском: инфостиль, тексты интерфейса, типографика, признаки нейросетевого текста; `ru-check` — полная вычитка без правки, `ru-score` — оценка 0–10 (talkstream/ru-text, MIT) |
| `humanizer-ru`                 | аудит русского текста на следы машинного: находит и объясняет, переписывает только по просьбе (vladimir-human/humanizer-ru, MIT) |
| `humanizer`                    | то же для английского, по Wikipedia «Signs of AI writing» (blader/humanizer, MIT) |
| `copywriting`, `copy-editing`  | тексты лендинга и продающих страниц: структура, призывы, правка в семь проходов (coreyhaines31/marketingskills, MIT) |

Вместе с `impeccable` перенесены его агенты — `.claude/agents/impeccable-*`.
Какой скилл к чему — `AGENTS.md`, «Скиллы»; что Claude подключает при правке
интерфейса — `.claude/rules/claude.md`.

## MCP проекта (`.mcp.json`)

- **`chrome-devtools`** — трейсы производительности на замедленном процессоре,
  консоль, сеть, эмуляция экрана, Lighthouse. Запускается с `--isolated`
  (временный профиль, твой Chrome не трогается), экран 390×844, без отправки
  адресов в CrUX и без статистики Google. Версия закреплена, Node 22 через
  `fnm exec`: пакету нужен Node ≥ 20.19, а по умолчанию стоит 20.9.
- **`lazyweb`** — референсы: экраны и сценарии реальных приложений. Вход по
  OAuth: `/mcp` → lazyweb → почта и шестизначный код. Бесплатно, но отчёты
  урезаны; полные — на платном тарифе. Скрипт `install.sh` с их сайта не
  запускаем: он ставит навыки глобально в `~/.claude/skills`.
- На Маке оба сервера выключены в личном `.claude/settings.local.json`
  (`disabledMcpjsonServers`) — включаются там же.

## Чего делать нельзя

- **`ui-ux-pro-max --persist`.** Он пишет `design-system/<проект>/MASTER.md` и
  называет его «Global Source of Truth» — второй источник правды на диске
  однажды разойдётся с документом дизайна.
- **`/impeccable document` без оговорки.** Он перезапишет `DESIGN.md` в корне,
  шапку которого генерируют токены (`design/tokens`); то же делает агент
  `impeccable-documenter`.

## Грабли

- **`impeccable` ставится и обновляется только установщиком**, а не
  копированием папки: `npx impeccable install --providers=claude --project --yes --force`
  (сам `npx` — на Node 22: `eval "$(fnm env --shell bash)" && fnm use 22`).
  Установщик кладёт скилл, агентов в `.claude/agents/impeccable-*` и хуки в
  `.claude/settings.local.json`. С версии 4.2 проверки делает скачанный
  бинарник `scripts/bin/<платформа>/impeccable`, Node ему не нужен.
- **Сюда `impeccable` скопирован папкой** — та же версия, что в LifeCommit.
  Хук детектора в git не ездит (`settings.local.json`), поэтому на Маке его
  нужно включить один раз: `/impeccable hooks on`. Следующее обновление — уже
  установщиком.
- **Бинарник `impeccable` в git не кладётся** (12 МБ, под одну платформу):
  в `.gitignore` строка `.claude/skills/impeccable/scripts/bin/`, лаунчер
  скачает его сам при первом запуске.
- **Чужие скиллы правлены руками** — обновление из источника или
  установщиком сотрёт правки, их придётся повторить (решения Даши 08.10.2026:
  ничего про React Native и Flutter, `variant` влит в `prototype`):
  - `ru-text` (10.10.2026) — типографика только в текстах продукта, не в `.md`, коде и чате (иначе
    неразрывные пробелы U+00A0 расползаются по документам); вложенные кавычки — «ёлочки», не „лапки“;
    папка `agents/` (Gemini, OpenAI) не скопирована;
  - `humanizer-ru` — из репозитория взяты только `SKILL.md`, `references/`, `knowledge/`: без CLI, `src/`,
    тестов и `eval/`; ссылки скилла на них — на исходный репозиторий;
  - `humanizer` — только `SKILL.md`; `copywriting`, `copy-editing` — без `evals/`. Лицензии — `LICENSES/`.
  - `ui-ux-pro-max` — удалены стеки `react-native` и `flutter` (данные и
    `scripts/core.py`, `validate_data.py`, `search.py`), четыре иконки под
    `phosphor-react-native`, библиотеки React Native в мобильных стилях
    (`styles.csv`) и шрифтах (`typography.csv`); примеры кода в
    `app-interface.csv` (`--domain web`) переписаны с React Native на SwiftUI и
    Compose; счётчики и хеш `icons.csv` в `catalog-summary.json` пересчитаны.
    Проверка после правки — `python3 scripts/validate_data.py`;
  - `impeccable` — убраны React Native и Flutter из `reference/ios.md`,
    `android.md`, `audit.native.md`;
  - `animate`, `mobile-native` — убраны ссылки на удалённые `animate-expo` и
    `find-animation-opportunities`;
  - `prototype` — влиты разделы из `variant` (одна главная ось, общий порог
    доступности, таблица ошибок) и `agents/openai.yaml`, чтобы Codex не
    вызывал его сам; такой же файл добавлен `review-animations`.
- **`better-*` написаны под английский текст.** Кириллица, «ёлочки» и
  неразрывные пробелы там не разобраны.
- **Палитры и пары шрифтов `ui-ux-pro-max` кириллицу не учитывают.** Для
  русскоязычного интерфейса шрифт выбирается по разбору кириллицы, а не из
  его базы.
- **Цвета мини-аппа.** `telegram-mini-app` требует брать их только из темы
  Telegram (`themeParams`), и его `check.sh` ругается на hex. Здесь решено
  иначе: свои цвета «Шагов» из токенов (решение Даши 05.10.2026, задача #2) —
  в мини-аппе из темы Telegram берётся только светлая она или тёмная. Готовые
  палитры навыков годятся только для акцента.

## Что откуда взято

| Папка | Источник | Лицензия |
| --- | --- | --- |
| `emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `apple-design`, `prototype`, `mobile-native` | github.com/emilkowalski/skills | MIT |
| `impeccable` | github.com/pbakaus/impeccable, `npx impeccable install` | Apache 2.0 |
| `ui-ux-pro-max` | github.com/nextlevelbuilder/ui-ux-pro-max-skill | MIT |
| `better-*`, `interface-review`; разделы `prototype` из `variant` | github.com/jakubkrehel/skills | MIT |
| `telegram-mini-app` | свой; часть правил — по мотивам victorzhuk/skills (Apache 2.0) и yaniv-golan (MIT), подмена — по шаблону tma.js (MIT) | — |
| `grilling` | свои | — |

Тексты лицензий MIT — в `LICENSES/`.
