"""Собрать docs/BACKLOG.md из выдачи `gh issue list --json`.

Вызывается из `tools/dev/backlog.sh`. В облачной сессии, где `gh` нет, на вход
подаётся тот же JSON (поля number, title, url, labels[].name), собранный из
открытых задач через GitHub MCP:

    python3 tools/dev/backlog.py < issues.json > docs/BACKLOG.md
"""

import json
import sys

# Порядок разделов важнее алфавита: сверху то, что блокирует и ждёт человека,
# ниже — то, что можно взять самому.
ORDER = [
    ('ждёт Дарью', 'Ждёт Дарью — сам сделать не могу'),
    ('ошибка', 'Ошибки'),
    ('инфраструктура', 'Инфраструктура'),
    ('контент', 'Контент'),
    ('дизайн', 'Дизайн'),
    ('юридическое', 'Юридическое'),
    ('документация', 'Документация'),
]

HEAD = """# Задачи

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
"""


def main() -> None:
    issues = json.load(sys.stdin)
    lines = [HEAD]
    seen: set[int] = set()

    def block(label: str, title: str) -> None:
        rows = [
            i for i in issues
            if label in [l['name'] for l in i['labels']] and i['number'] not in seen
        ]
        if not rows:
            return
        lines.append('## ' + title + '\n')
        for i in sorted(rows, key=lambda x: x['number']):
            seen.add(i['number'])
            lines.append('- [#{n}]({url}) {t}'.format(n=i['number'], url=i['url'], t=i['title']))
        lines.append('')

    for label, title in ORDER:
        block(label, title)

    rest = [i for i in issues if i['number'] not in seen]
    if rest:
        lines.append('## Без метки\n')
        for i in sorted(rest, key=lambda x: x['number']):
            lines.append('- [#{n}]({url}) {t}'.format(n=i['number'], url=i['url'], t=i['title']))
        lines.append('')

    if not issues:
        lines.append('Открытых задач нет.\n')

    sys.stdout.write('\n'.join(lines))


if __name__ == '__main__':
    main()
