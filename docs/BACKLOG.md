# Задачи

⚠️ **Файл собирается автоматически** командой `tools/dev/backlog.sh` из
открытых задач GitHub. Править руками бессмысленно — следующий прогон затрёт.
Заводить и закрывать нужно в Issues (в облаке, где `gh` нет, — через GitHub MCP,
а зеркало собирать `tools/dev/backlog.py`, см. его шапку):

```bash
gh issue list                  # что открыто
gh issue create --title "…"    # завести
gh issue close 7               # закрыть
tools/dev/backlog.sh           # пересобрать это зеркало
```

Сюда попадает только то, что **точно будем делать**: замеченные ошибки,
недоделки, хвосты от сделанного. Идеи и «хорошо бы когда-нибудь» живут в
`docs/ROADMAP.md` — иначе список разрастётся и его перестанут открывать.

## Ждёт Дарью — сам сделать не могу

- [#5](https://github.com/daryaleushkina/greprepapp/issues/5) Вход через Google в приложении Apple: где менять код на id_token
- [#6](https://github.com/daryaleushkina/greprepapp/issues/6) Аккаунт Apple Developer: подключить к приложению
- [#7](https://github.com/daryaleushkina/greprepapp/issues/7) Экран входа: ссылки на условия и политику конфиденциальности
- [#12](https://github.com/daryaleushkina/greprepapp/issues/12) Android: вход через Telegram, Google и Apple
- [#14](https://github.com/daryaleushkina/greprepapp/issues/14) Android: эмулятор и инструментальные тесты (Keystore, сеть, запуск)

## Инфраструктура

- [#4](https://github.com/daryaleushkina/greprepapp/issues/4) Договор API: новое значение enum в ответе ломает уже установленные приложения
- [#9](https://github.com/daryaleushkina/greprepapp/issues/9) /gp-review: линзы доступа и интерфейса не включаются для server/ и apps/web
- [#10](https://github.com/daryaleushkina/greprepapp/issues/10) CI токенов: корневой lockfile pnpm и Node 24
- [#11](https://github.com/daryaleushkina/greprepapp/issues/11) Стенд: вход подменой даёт роль admin кому угодно
- [#15](https://github.com/daryaleushkina/greprepapp/issues/15) Приложение Apple: правила вёрстки в тестах и прогон на iOS 18 в CI
- [#28](https://github.com/daryaleushkina/greprepapp/issues/28) e2e: вход на сайте в WebKit нестабилен, когда Мак перегружен — гейт краснеет на «flaky»

## Без метки

- [#8](https://github.com/daryaleushkina/greprepapp/issues/8) Язык приложения и язык плана с сервера могут разойтись
- [#13](https://github.com/daryaleushkina/greprepapp/issues/13) Приложение Apple: сеть пропала без запроса — нет строки «Нет сети», план не обновляется после
- [#16](https://github.com/daryaleushkina/greprepapp/issues/16) Android: два тихих случая в кэше плана (после ревью каркаса)
- [#17](https://github.com/daryaleushkina/greprepapp/issues/17) Сайт: после входа и конца сессии теряется адрес, с которого пришли
- [#18](https://github.com/daryaleushkina/greprepapp/issues/18) Приложения Apple и Android: дисклеймер ETS в настройках
- [#19](https://github.com/daryaleushkina/greprepapp/issues/19) Приложение Apple: передавать язык системы при входе (поле locale)
- [#20](https://github.com/daryaleushkina/greprepapp/issues/20) Веб: разбить сборку по экранам — один пакет 528 КБ (165 КБ gzip)
- [#21](https://github.com/daryaleushkina/greprepapp/issues/21) Приложение Apple: тренировки, первый срез — экраны по готовому договору
- [#22](https://github.com/daryaleushkina/greprepapp/issues/22) Мини-апп и сайт: тренировки, первый срез — экраны по готовому договору
- [#23](https://github.com/daryaleushkina/greprepapp/issues/23) Задания Quant: формулы сверх Unicode — дроби, степени, корни
- [#24](https://github.com/daryaleushkina/greprepapp/issues/24) Админка: правка проверенного задания — новой версией, не на месте; очередь жалоб
- [#25](https://github.com/daryaleushkina/greprepapp/issues/25) Android: истёкший вход стирает неотправленные ответы тренировки без следа
