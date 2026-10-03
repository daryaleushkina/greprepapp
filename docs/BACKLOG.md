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

- [#1](https://github.com/daryaleushkina/greprepapp/issues/1) telegram-mini-app: найти недостающие файлы скилла

## Дизайн

- [#2](https://github.com/daryaleushkina/greprepapp/issues/2) Цвета мини-аппа: тема Telegram или свои hex
