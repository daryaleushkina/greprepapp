// Проверяем настоящий блок запуска тестов гейта с подменными командами: без сборки, сервера и устройств.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const gate = fs.readFileSync(fileURLToPath(new URL('./gate-apple', import.meta.url)), 'utf8');
const start = gate.indexOf('# Свои симуляторы GrePrep');
const tests = gate.slice(start);
const threshold = gate.match(/^APPLE_COVERAGE_MIN=.+$/m)?.[0];
const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function run(mode: string, coverage = 0.97) {
  expect(start).toBeGreaterThanOrEqual(0);
  expect(threshold).toBeDefined();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-apple-gate-'));
  temporary.push(dir);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(dir, 'scripts'));
  const executable = (file: string, body: string) => {
    fs.writeFileSync(path.join(dir, file), `#!/bin/sh\nset -eu\n${body}\n`);
    fs.chmodSync(path.join(dir, file), 0o755);
  };
  executable('scripts/simulator.sh', 'printf "simulator %s\\n" "$*" >> "$GP_TEST_CALLS"\necho "$1"');
  executable('bin/xcrun', '[ "$1" = xccov ] || exit 99\n/bin/cat "$GP_TEST_COVERAGE"');
  fs.symlinkSync('/bin/sh', path.join(bin, 'sh'));
  fs.symlinkSync('/usr/bin/awk', path.join(bin, 'awk'));
  fs.writeFileSync(path.join(dir, 'coverage.json'), JSON.stringify({ targets: [{ name: 'GrePrep.app', lineCoverage: coverage }] }));
  const result = spawnSync('/bin/sh', ['-c', `
set -eu
${threshold}
work="$GP_TEST_WORK"
UI_PORT=8097
build_step() { printf 'build %s\\n' "$*" >> "$GP_TEST_CALLS"; }
run_tests() { printf 'test %s\\n' "$*" >> "$GP_TEST_CALLS"; }
sim_boot() { printf 'boot %s\\n' "$*" >> "$GP_TEST_CALLS"; }
sim_release() { printf 'release %s\\n' "$*" >> "$GP_TEST_CALLS"; }
${tests}
`], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env, PATH: bin, GATE_APPLE_SKIP_SNAPSHOTS: mode, GATE_APPLE_IPHONE_UDID: '',
      GP_TEST_WORK: path.join(dir, 'work'), GP_TEST_CALLS: path.join(dir, 'calls'), GP_TEST_COVERAGE: path.join(dir, 'coverage.json'),
    },
  });
  const calls = fs.readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n');
  return { result, calls, testCalls: calls.filter((call) => call.startsWith('test ')) };
}

describe('gate-apple — снимки обязательны локально, в CI пропускаются по решению Даши', () => {
  it.each(['', '0'])('без включённого флага (%s) iPhone, iPad и Mac сверяют снимки', (mode) => {
    const { result, calls, testCalls } = run(mode);
    expect(result.status, result.stderr).toBe(0);
    expect(testCalls.map((call) => call.split(' ')[1])).toEqual(['iphone', 'ipad', 'mac']);
    expect(testCalls.every((call) => !call.includes('-skip-testing:'))).toBe(true);
    expect(testCalls[1]).toContain('-only-testing:GrePrepTests/ScreenSnapshotTests');
    expect(calls).toContain('boot ipad');
  });

  it('в CI исключает только ScreenSnapshotTests у iPhone и Mac, iPad не создаёт и не запускает', () => {
    const { result, calls, testCalls } = run('1');
    expect(result.status, result.stderr).toBe(0);
    expect(testCalls.map((call) => call.split(' ')[1])).toEqual(['iphone', 'mac']);
    expect(testCalls.every((call) => call.includes('-skip-testing:GrePrepTests/ScreenSnapshotTests'))).toBe(true);
    expect(testCalls.every((call) => !call.includes('-skip-testing:GrePrepUITests'))).toBe(true);
    expect(testCalls[0]).toContain('-enableCodeCoverage YES');
    expect(calls).not.toContain('simulator ipad');
    expect(calls).not.toContain('boot ipad');
    expect(result.stderr).toContain('снимки не сверялись (CI, решение Даши 09.10.2026)');
  });

  it('покрытие без снимков ниже 96% останавливает гейт, без исключения файлов и снижения порога', () => {
    const { result } = run('1', 0.959);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('95.9% ниже порога 96.0%');
  });
});
