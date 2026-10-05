#!/bin/sh
# Клиент API для приложения Apple из договора api/openapi.yaml. Запускать после правки договора;
# результат (Packages/GPAPI/Sources/GPAPI/Generated) коммитится, гейт проверяет, что он свежий.
#
# Перед генерацией из копии договора убирается `additionalProperties: false`. На сервере это правило
# отклоняет лишние поля запроса, а в приложении превратилось бы в строгий разбор ответа: сервер добавил
# поле — и все уже установленные версии приложения перестали бы читать ответ. Обновить их силой нельзя,
# поэтому клиент читает ответ «терпимо»: известные поля проверяются по типам, незнакомые пропускаются.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$here/Packages/GPAPI/Sources/GPAPI/Generated"
spec="$(mktemp -d)/openapi.yaml"
trap 'rm -rf "$(dirname "$spec")"' EXIT
sed '/^[[:space:]]*additionalProperties:[[:space:]]*false[[:space:]]*$/d' "$root/api/openapi.yaml" > "$spec"
mkdir -p "$out"
swift run --quiet --package-path "$here/Tools" swift-openapi-generator generate \
  --config "$here/Packages/GPAPI/openapi-generator-config.yaml" \
  --output-directory "$out" \
  "$spec" >/dev/null
# Строгий разбор мог вернуться, если в договоре появится другая запись `additionalProperties: false`
# (например, в одну строку с другими ключами) — тогда sed выше её не уберёт.
if grep -rq ensureNoAdditionalProperties "$out"; then
  echo "generate-api: клиент снова строгий к лишним полям — поправить sed выше под новую запись договора" >&2
  exit 1
fi
