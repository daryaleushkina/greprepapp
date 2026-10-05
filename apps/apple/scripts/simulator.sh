#!/bin/sh
# UDID своего симулятора GrePrep; нет — создаёт. Свои устройства — чтобы сценарии и снимки не делили
# симулятор с соседними проектами на этом Маке и не зависели от того, что там запущено.
#   sh scripts/simulator.sh iphone | ipad | iphone-ios18
set -eu
case "${1:-iphone}" in
  iphone) name="GrePrep iPhone"; type="iPhone-18-Pro"; runtime="iOS-27-0" ;;
  ipad) name="GrePrep iPad"; type="iPad-Pro-11-inch-M5-12GB"; runtime="iOS-27-0" ;;
  # Самая старая поддерживаемая iOS (PRODUCT.md, «Platform»): матовая подложка вместо стекла.
  iphone-ios18) name="GrePrep iPhone iOS 18"; type="iPhone-16-Pro"; runtime="iOS-18-0" ;;
  *) echo "simulator.sh: unknown device $1" >&2; exit 2 ;;
esac
udid="$(xcrun simctl list devices --json | /usr/bin/python3 -c '
import json, sys
name, runtime = sys.argv[1], "com.apple.CoreSimulator.SimRuntime." + sys.argv[2]
for d in json.load(sys.stdin)["devices"].get(runtime, []):
    if d["name"] == name and d.get("isAvailable", True):
        print(d["udid"]); break
' "$name" "$runtime")"
if [ -z "$udid" ]; then
  udid="$(xcrun simctl create "$name" "com.apple.CoreSimulator.SimDeviceType.$type" "com.apple.CoreSimulator.SimRuntime.$runtime")"
fi
echo "$udid"
