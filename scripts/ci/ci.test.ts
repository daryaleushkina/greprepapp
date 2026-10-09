// Подменяем только внешние команды: настоящие шаги CI и cleanup проверяются без SDK, Xcode и устройств.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-ci-'));
  temporary.push(dir);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const executable = (file: string, body: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `#!/bin/sh\nset -eu\n${body}\n`);
    fs.chmodSync(file, 0o755);
  };
  return { dir, bin, executable };
}

// Извлекаем shell именно из шага workflow: отдельная копия команды не поймает регрессию в YAML.
function androidSetup() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const step = workflow.split('      - name: Android SDK из образа раннера\n')[1]?.split('\n      - ')[0];
  expect(step, 'шаг установки SDK есть в workflow').toBeDefined();
  const lines = (step ?? '').split('\n');
  const start = lines.findIndex((line) => line.startsWith('        run: '));
  expect(start).toBeGreaterThanOrEqual(0);
  const run = lines[start]?.slice('        run: '.length);
  if (run !== '|') return run ?? '';
  return lines.slice(start + 1).map((line) => line.slice(10)).join('\n');
}

describe('CI Android — SDK вне PATH и лицензии', () => {
  function setup(status: { licenses?: number; install?: number } = {}) {
    const f = fixture();
    const sdk = path.join(f.dir, 'android sdk');
    const calls = path.join(f.dir, 'sdk-calls');
    fs.symlinkSync('/usr/bin/yes', path.join(f.bin, 'yes'));
    f.executable(path.join(sdk, 'cmdline-tools/latest/bin/sdkmanager'), `
IFS= read -r answer
[ "$answer" = y ] || { echo 'Не принят запрос лицензии' >&2; exit 2; }
printf '%s\\n' "$*" >> "$SDK_CALLS"
case "$*" in
  *--licenses*) exit ${status.licenses ?? 0} ;;
  *) exit ${status.install ?? 0} ;;
esac
`);
    const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', androidSetup()], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: f.bin, ANDROID_HOME: sdk, SDK_CALLS: calls },
    });
    return { result, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [] };
  }

  it('находит sdkmanager по ANDROID_HOME и отвечает на лицензии при установке', () => {
    const { result, calls } = setup();
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('--licenses');
    expect(calls[1]).toContain('platforms;android-37.0');
    expect(calls[1]).toContain('build-tools;37.0.0');
  });

  it('ошибка лицензий сохраняется; установка не начинается', () => {
    const { result, calls } = setup({ licenses: 42 });
    expect(result.status).toBe(42);
    expect(calls).toHaveLength(1);
  });

  it('ошибка установки сохраняется', () => {
    const { result } = setup({ install: 43 });
    expect(result.status).toBe(43);
  });
});

describe('CI Apple — диагностика без запуска устройств', () => {
  function diagnose({ legacy = false, fail = false } = {}) {
    const f = fixture();
    const runtime = 'com.apple.CoreSimulator.SimRuntime.iOS-27-0';
    const type = 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro';
    const data = path.join(f.dir, 'device/data');
    fs.mkdirSync(path.dirname(data), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(data), 'device.plist'),
      `<plist version="1.0"><dict><key>deviceType</key><string>${type}</string></dict></plist>`);
    const payloads = {
      runtimes: { runtimes: [{ identifier: runtime, name: 'iOS 27.0', version: '27.0', buildversion: '24A434', isAvailable: true }] },
      devicetypes: { devicetypes: [{ identifier: type, name: 'iPhone 18 Pro' }] },
      devices: { devices: { [runtime]: [
        { name: 'GrePrep iPhone', udid: 'own', state: 'Shutdown', dataPath: data, ...(legacy ? {} : { deviceTypeIdentifier: type }) },
        { name: 'Other iPhone', udid: 'other', state: 'Booted', deviceTypeIdentifier: type },
      ] } },
    };
    for (const [name, payload] of Object.entries(payloads)) {
      fs.writeFileSync(path.join(f.dir, `${name}.json`), JSON.stringify(payload));
    }
    f.executable(path.join(f.bin, 'xcodebuild'), `
printf 'xcodebuild %s\\n' "$*" >> "$CI_TEST_DIR/calls"
[ "$*" = -version ] || exit 99
printf 'Xcode 27.0\\nBuild version 27A266a\\n'
`);
    f.executable(path.join(f.bin, 'xcrun'), `
printf 'xcrun %s\\n' "$*" >> "$CI_TEST_DIR/calls"
case "$*" in
  'simctl runtime list')
    ${fail ? "echo 'runtime list failed' >&2; exit 42" : "printf 'iOS 27.0 (24A434)\\n'"} ;;
  'simctl list devicetypes') printf 'iPhone 18 Pro (com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro)\\n' ;;
  'simctl list runtimes --json') /bin/cat "$CI_TEST_DIR/runtimes.json" ;;
  'simctl list devicetypes --json') /bin/cat "$CI_TEST_DIR/devicetypes.json" ;;
  'simctl list devices --json') /bin/cat "$CI_TEST_DIR/devices.json" ;;
  *) echo 'Неожиданный вызов, включая запуск устройства' >&2; exit 99 ;;
esac
`);
    const output = path.join(f.dir, 'artifacts');
    const result = spawnSync('python3', [path.join(ROOT, 'scripts/ci/apple-diagnostics.py'), output], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH ?? ''}`, CI_TEST_DIR: f.dir },
    });
    return { result, output, calls: fs.readFileSync(path.join(f.dir, 'calls'), 'utf8').trim().split('\n') };
  }

  it.each([false, true])('сохраняет Xcode и точные тип/среду/сборку GrePrep (device.plist: %s)', (legacy) => {
    const { result, output, calls } = diagnose({ legacy });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('27A266a');
    expect(result.stdout).toContain('24A434');
    const summary = fs.readFileSync(path.join(output, 'greprep-devices.json'), 'utf8');
    expect(summary).toContain('GrePrep iPhone');
    expect(summary).toContain('iPhone 18 Pro');
    expect(summary).toContain('com.apple.CoreSimulator.SimRuntime.iOS-27-0');
    expect(summary).not.toContain('Other iPhone');
    expect(calls).toEqual([
      'xcodebuild -version', 'xcrun simctl runtime list', 'xcrun simctl list devicetypes',
      'xcrun simctl list runtimes --json', 'xcrun simctl list devicetypes --json', 'xcrun simctl list devices --json',
    ]);
    expect(fs.readFileSync(path.join(output, 'xcode.txt'), 'utf8')).toContain('27A266a');
  });

  it('сохраняет stderr и завершается ошибкой, если команда диагностики упала', () => {
    const { result, output } = diagnose({ fail: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('runtime list failed');
    expect(fs.readFileSync(path.join(output, 'runtime-list.txt.stderr'), 'utf8')).toContain('runtime list failed');
  });
});
