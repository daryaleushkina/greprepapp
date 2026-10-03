#!/usr/bin/env bash
#
# Зеркало открытых задач GitHub в docs/BACKLOG.md.
#
# Задачи живут в Issues — там их видно с телефона и можно завести, не открывая
# терминал. Но задачу, лежащую только в сети, я не вижу, пока за ней специально
# не схожу, и потому забываю. Зеркало в репозитории читается вместе с кодом.
#
# Файл собирается отсюда и только отсюда: править его руками бессмысленно —
# следующий прогон затрёт. Менять надо саму задачу в Issues.
#
#   tools/dev/backlog.sh          # пересобрать docs/BACKLOG.md
#   tools/dev/backlog.sh --check  # проверить, что зеркало свежее (для CI)
#
# Питон вынесен в соседний файл, а не вложен сюда строкой: кавычки внутри
# `python3 -c '...'` закрывают строку оболочки, и скрипт ломается на первом же
# словаре. Проверено на себе.
#
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$root/docs/BACKLOG.md"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

gh issue list --state open --limit 200 --json number,title,url,labels \
  | python3 "$here/backlog.py" > "$tmp"

if [[ "${1:-}" == "--check" ]]; then
  if ! diff -q "$tmp" "$out" >/dev/null 2>&1; then
    echo "docs/BACKLOG.md устарел — выполните tools/dev/backlog.sh" >&2
    exit 1
  fi
  exit 0
fi

mv "$tmp" "$out"
trap - EXIT
echo "docs/BACKLOG.md собран: $(grep -c '^- \[#' "$out") задач"
