#!/usr/bin/env python3
"""Версии инструментов и созданные GrePrep-устройства; команды только читают состояние."""

import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys


def command(directory: Path, filename: str, *args: str) -> str:
    result = subprocess.run(args, check=False, capture_output=True, text=True)
    (directory / filename).write_text(result.stdout)
    if result.stderr:
        (directory / (filename + ".stderr")).write_text(result.stderr)
        sys.stderr.write(result.stderr)
    result.check_returncode()
    return result.stdout


def main() -> None:
    directory = Path(sys.argv[1])
    directory.mkdir(parents=True, exist_ok=True)
    print(command(directory, "xcode.txt", "xcodebuild", "-version"), end="")
    print(command(directory, "runtime-list.txt", "xcrun", "simctl", "runtime", "list"), end="")
    types_text = command(directory, "device-types.txt", "xcrun", "simctl", "list", "devicetypes")
    print("\n".join(line for line in types_text.splitlines() if "iphone" in line.lower()))
    runtimes = json.loads(command(directory, "runtimes.json", "xcrun", "simctl", "list", "runtimes", "--json"))["runtimes"]
    types = json.loads(command(directory, "devicetypes.json", "xcrun", "simctl", "list", "devicetypes", "--json"))["devicetypes"]
    devices = json.loads(command(directory, "devices.json", "xcrun", "simctl", "list", "devices", "--json"))["devices"]
    runtimes_by_id = {runtime["identifier"]: runtime for runtime in runtimes}
    types_by_id = {device_type["identifier"]: device_type["name"] for device_type in types}
    selected = []
    for runtime_id, group in devices.items():
        for device in group:
            if not (device["name"].startswith("GrePrep ") or device["udid"] == os.environ.get("GATE_APPLE_IPHONE_UDID")):
                continue
            runtime = runtimes_by_id[runtime_id]
            type_id = device.get("deviceTypeIdentifier")
            if not type_id:
                # В старых simctl тип есть только в device.plist рядом с data, а не в выводе list devices.
                location = (Path(device["dataPath"]).parent if "dataPath" in device else
                            Path.home() / "Library/Developer/CoreSimulator/Devices" / device["udid"])
                with (location / "device.plist").open("rb") as source:
                    type_id = plistlib.load(source)["deviceType"]
            selected.append({
                "name": device["name"],
                "udid": device["udid"],
                "state": device["state"],
                "deviceType": types_by_id[type_id],
                "deviceTypeIdentifier": type_id,
                "runtime": runtime["name"],
                "runtimeIdentifier": runtime_id,
                "version": runtime["version"],
                "build": runtime["buildversion"],
                "isAvailable": runtime["isAvailable"],
            })
    if not selected:
        raise ValueError("Не найдено созданных симуляторов GrePrep")
    summary = json.dumps(selected, ensure_ascii=False, indent=2) + "\n"
    (directory / "greprep-devices.json").write_text(summary)
    print("Симуляторы GrePrep (тип, среда, версия и сборка):\n" + summary, end="")


if __name__ == "__main__":
    main()
