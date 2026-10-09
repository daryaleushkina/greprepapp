import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HOOKS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HOOKS, '../..');
const TARGET = 'target-sim';
const temporaryDirs: string[] = [];
// Даже подменённые команды требуют запуска sh: на общем загруженном Маке это бывает дольше 5 с.
// Процесс ограничен отдельно; ожидание устройств подменено и проверяется по журналу вызовов sleep.
const PROCESS_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = PROCESS_TIMEOUT_MS + 5000;
// Проверяем настоящую ловушку гейта отдельно: его сборки, сервер и реальные устройства запускать не нужно.
const gate = fs.readFileSync(path.join(HOOKS, 'gate-apple'), 'utf8');
const gateCleanup = gate.slice(gate.indexOf('\ncleanup() {'), gate.indexOf('\nneed() {'));

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// Ошибки и состояния — в файлах: дочерние команды видят те же изменения, что и тест, без настоящих устройств.
const faults = `
fails() {
  file="$GP_TEST_STATE/$1-errors"
  [ -f "$file" ] || return 1
  IFS= read -r left <"$file"
  [ "$left" -ne 0 ] || return 1
  if [ "$left" -gt 0 ]; then echo $((left - 1)) >"$file"; fi
  return 0
}
`;

function fixture({ adb = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-sim-devices-'));
  temporaryDirs.push(dir);
  const bin = path.join(dir, 'bin');
  const stateDir = path.join(dir, 'state');
  fs.mkdirSync(bin);
  fs.mkdirSync(stateDir);
  const write = (file: string, value: string) => {
    const destination = path.join(dir, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, value.endsWith('\n') ? value : `${value}\n`);
  };
  const executable = (file: string, value: string) => {
    write(file, `#!/bin/sh\nset -eu\n${value}\n`);
    fs.chmodSync(path.join(dir, file), 0o755);
  };
  // PATH изолирован: отсутствие adb не должно случайно найти SDK машины, а xcrun всегда подменён.
  for (const command of ['cat', 'dirname', 'grep', 'mktemp', 'rm', 'sh']) {
    const real = fs.existsSync(`/bin/${command}`) ? `/bin/${command}` : `/usr/bin/${command}`;
    fs.symlinkSync(real, path.join(bin, command));
  }
  executable('bin/xcrun', `
printf 'xcrun %s\n' "$*" >>"$GP_TEST_STATE/calls"
${faults}
case "$*" in
  'simctl list devices booted')
    list_call=0
    if [ -f "$GP_TEST_STATE/list-calls" ]; then IFS= read -r list_call <"$GP_TEST_STATE/list-calls"; fi
    list_call=$((list_call + 1))
    echo "$list_call" >"$GP_TEST_STATE/list-calls"
    # Чередуем удачный подсчёт и ошибку повторного чтения состояния после wait_for_slot.
    if [ "$list_call" -ge 3 ] && [ "$((list_call % 2))" -eq 1 ] && fails postlist; then exit 1; fi
    if fails list; then echo 'simctl list: подменённая ошибка' >&2; exit 1; fi
    echo '== Devices =='
    for file in "$GP_TEST_STATE"/sim-*; do
      [ -f "$file" ] || continue
      IFS= read -r state <"$file"
      if [ "$state" = Booted ]; then
        printf '    GrePrep (%s) (Booted)\n' "\${file##*/sim-}"
      fi
    done
    ;;
  'simctl boot '*)
    if [ -f "$GP_TEST_STATE/boot-race" ]; then
      echo Booted >"$GP_TEST_STATE/sim-$3"
      echo 'simctl boot: уже включён другим' >&2
      exit 1
    fi
    if [ -f "$GP_TEST_STATE/boot-interrupt" ]; then
      echo Booting >"$GP_TEST_STATE/sim-$3"
      kill -TERM "$PPID"
      exit 1
    fi
    if fails boot; then echo 'simctl boot: подменённая ошибка' >&2; exit 1; fi
    echo Booted >"$GP_TEST_STATE/sim-$3"
    ;;
  'simctl bootstatus '*)
    if fails bootstatus; then exit 1; fi
    ;;
  'simctl shutdown '*)
    if fails shutdown; then echo 'simctl shutdown: подменённая ошибка' >&2; exit 1; fi
    echo Shutdown >"$GP_TEST_STATE/sim-$3"
    ;;
  'simctl install '*|'simctl terminate '*|'simctl launch '*) ;;
  *) echo "Неожиданный xcrun: $*" >&2; exit 2 ;;
esac
`);
  if (adb) {
    executable('bin/adb', `
printf 'adb %s\n' "$*" >>"$GP_TEST_STATE/calls"
${faults}
[ "$*" = devices ] || exit 2
if fails adb; then echo 'adb devices: подменённая ошибка' >&2; exit 1; fi
echo 'List of devices attached'
cat "$GP_TEST_STATE/android"
`);
  }
  write('state/android', '');
  executable('bin/sleep', `
printf 'sleep %s\n' "$*" >>"$GP_TEST_STATE/calls"
poll=0
if [ -f "$GP_TEST_STATE/polls" ]; then IFS= read -r poll <"$GP_TEST_STATE/polls"; fi
echo $((poll + 1)) >"$GP_TEST_STATE/polls"
if [ -f "$GP_TEST_STATE/on-poll" ]; then . "$GP_TEST_STATE/on-poll"; fi
`);
  const env = {
    ...process.env,
    PATH: bin,
    ANDROID_HOME: path.join(dir, 'sdk'),
    GP_TEST_STATE: stateDir,
    GP_HELPER: path.join(HOOKS, 'sim-devices'),
    GP_DEVICES_MAX: '5',
    GP_DEVICES_WAIT_SEC: '20',
    GP_DEVICES_POLL_SEC: '10',
  };
  const run = (body: string, cleanup = true, overrides: Record<string, string> = {}) => spawnSync('/bin/sh', ['-c', `
set -eu
. "$GP_HELPER"
${cleanup ? `
work="$GP_TEST_STATE/work"
server_pid=""
${gateCleanup}
` : ''}
${body}
`], { cwd: dir, encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS, env: { ...env, ...overrides } });
  const calls = () => fs.existsSync(path.join(stateDir, 'calls'))
    ? fs.readFileSync(path.join(stateDir, 'calls'), 'utf8').trim().split('\n')
    : [];
  const booted = (count: number) => {
    for (let i = 0; i < count; i++) write(`state/sim-neighbor-${i}`, 'Booted');
  };
  const fault = (command: string, count = -1) => write(`state/${command}-errors`, `${count}`);
  const onPoll = (body: string) => write('state/on-poll', body);
  const state = (sim = TARGET) => fs.readFileSync(path.join(stateDir, `sim-${sim}`), 'utf8').trim();
  const runSim = (args: string[] = []) => {
    const scripts = 'apps/apple/scripts';
    write(`${scripts}/run-sim.sh`, fs.readFileSync(path.join(ROOT, scripts, 'run-sim.sh'), 'utf8'));
    write('scripts/hooks/sim-devices', fs.readFileSync(path.join(HOOKS, 'sim-devices'), 'utf8'));
    executable(`${scripts}/simulator.sh`, `echo ${TARGET}`);
    executable(`${scripts}/generate-project.sh`, ':');
    executable('bin/xcodebuild', ':');
    return spawnSync('/bin/sh', [path.join(dir, scripts, 'run-sim.sh'), ...args], {
      cwd: dir, encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS, env,
    });
  };
  return { dir, write, run, calls, booted, fault, onPoll, state, runSim };
}

const boot = `sim_boot ${TARGET}`;
const release = `sim_release ${TARGET}`;

describe('sim-devices — подсчёт и ожидание', { timeout: TEST_TIMEOUT_MS }, () => {
  it('подключение помощника ничего не запускает; по умолчанию предел 5, срок 900 с, шаг 10 с', () => {
    const f = fixture();
    const r = f.run('echo "$DEVICES_MAX $DEVICES_WAIT_SEC $DEVICES_POLL_SEC"', false, {
      GP_DEVICES_MAX: '', GP_DEVICES_WAIT_SEC: '', GP_DEVICES_POLL_SEC: '',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('5 900 10');
    expect(f.calls()).toEqual([]);
  });

  it('считает симуляторы и эмуляторы, включая offline, но не физический Android', () => {
    const f = fixture();
    f.booted(2);
    f.write('state/android', 'emulator-5554\tdevice\nemulator-5556\toffline\nphone-serial\tdevice\n');
    const r = f.run('devices_on');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('4');
  });

  it('без adb эмуляторов ноль', () => {
    const f = fixture({ adb: false });
    f.booted(2);
    const r = f.run('devices_on');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('2');
    expect(f.calls()).not.toContain('adb devices');
  });

  it('находит adb в ANDROID_HOME, если его нет в PATH', () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.dir, 'sdk/platform-tools'), { recursive: true });
    fs.renameSync(path.join(f.dir, 'bin/adb'), path.join(f.dir, 'sdk/platform-tools/adb'));
    f.write('state/android', 'emulator-5554\tdevice\n');
    const r = f.run('devices_on');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('1');
  });

  it('не ждёт при четырёх включённых устройствах', () => {
    const f = fixture();
    f.booted(4);
    expect(f.run('wait_for_slot').status).toBe(0);
    expect(f.calls().filter((call) => call.startsWith('sleep '))).toEqual([]);
  });

  it('ждёт место при пяти; включает своё только после освобождения', () => {
    const f = fixture();
    f.booted(5);
    f.onPoll('echo Shutdown >"$GP_TEST_STATE/sim-neighbor-0"');
    const r = f.run(boot);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('жду свободного места');
    const calls = f.calls();
    expect(calls.indexOf(`xcrun simctl boot ${TARGET}`)).toBeGreaterThan(calls.indexOf('sleep 10'));
    expect(f.state()).toBe('Shutdown');
  });

  it('по истечении срока красный, шестое устройство не включает', () => {
    const f = fixture();
    f.booted(5);
    const r = f.run(boot);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('места нет');
    expect(f.calls().filter((call) => call === 'sleep 10')).toHaveLength(2);
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
  });

  it('предел, срок и шаг переопределяются; последний шаг не выходит за срок', () => {
    const f = fixture();
    f.booted(2);
    const r = f.run('wait_for_slot', true, { GP_DEVICES_MAX: '2', GP_DEVICES_WAIT_SEC: '3', GP_DEVICES_POLL_SEC: '2' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('при пределе 2');
    expect(f.calls().filter((call) => call.startsWith('sleep '))).toEqual(['sleep 2', 'sleep 1']);
  });

  it.each(['list', 'adb'])('ошибка %s при подсчёте — неизвестное число, а не ноль', (command) => {
    const f = fixture();
    f.fault(command);
    const r = f.run('devices_on');
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain(command === 'list' ? 'xcrun simctl list devices booted' : 'adb devices');
  });

  it.each(['list', 'adb'])('после временной ошибки %s ждёт и повторяет подсчёт до boot', (command) => {
    const f = fixture();
    f.fault(command);
    f.onPoll(`echo 0 >"$GP_TEST_STATE/${command}-errors"`);
    const r = f.run(boot);
    expect(r.status, r.stderr).toBe(0);
    const calls = f.calls();
    expect(calls).toContain('sleep 10');
    expect(calls.indexOf(`xcrun simctl boot ${TARGET}`)).toBeGreaterThan(calls.indexOf('sleep 10'));
  });

  it.each(['list', 'adb'])('постоянная ошибка %s — красный по сроку с причиной, без boot', (command) => {
    const f = fixture();
    f.fault(command);
    const r = f.run(boot);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(command === 'list' ? 'xcrun simctl list devices booted' : 'adb devices');
    expect(f.calls().filter((call) => call === 'sleep 10')).toHaveLength(2);
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
  });

  it('ошибка подсчёта и занятые места используют один срок ожидания', () => {
    const f = fixture();
    f.booted(5);
    f.fault('adb');
    f.onPoll('echo 0 >"$GP_TEST_STATE/adb-errors"');
    const r = f.run('wait_for_slot');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('места нет');
    expect(f.calls().filter((call) => call === 'sleep 10')).toHaveLength(2);
  });

  it('ошибка повторной проверки после wait_for_slot тоже ждёт, затем включает', () => {
    const f = fixture();
    f.fault('postlist', 1);
    const r = f.run(boot);
    expect(r.status, r.stderr).toBe(0);
    const calls = f.calls();
    expect(calls.filter((call) => call === 'sleep 10')).toHaveLength(1);
    expect(calls.indexOf(`xcrun simctl boot ${TARGET}`)).toBeGreaterThan(calls.indexOf('sleep 10'));
  });

  it('ошибки повторной проверки после wait_for_slot не начинают срок ожидания заново', () => {
    const f = fixture();
    f.fault('postlist');
    const r = f.run(boot);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('xcrun simctl list devices booted');
    expect(f.calls().filter((call) => call === 'sleep 10')).toHaveLength(2);
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
  });
});

describe('sim-devices — владение и выключение', { timeout: TEST_TIMEOUT_MS }, () => {
  it('уже включённый, даже при полной пятёрке, не становится своим и не гасится', () => {
    const f = fixture();
    f.booted(4);
    f.write(`state/sim-${TARGET}`, 'Booted');
    const r = f.run(`${boot}\n${release}\necho "owned:$booted_here"`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('owned:');
    expect(f.state()).toBe('Booted');
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
    expect(f.calls()).not.toContain(`xcrun simctl shutdown ${TARGET}`);
  });

  it('включённый другим во время ожидания не становится своим и не гасится', () => {
    const f = fixture();
    f.booted(5);
    f.onPoll(`echo Shutdown >"$GP_TEST_STATE/sim-neighbor-0"
echo Shutdown >"$GP_TEST_STATE/sim-neighbor-1"
echo Booted >"$GP_TEST_STATE/sim-${TARGET}"`);
    const r = f.run(`${boot}\n${release}\necho "owned:$booted_here"`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('owned:');
    expect(f.state()).toBe('Booted');
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
    expect(f.calls()).not.toContain(`xcrun simctl shutdown ${TARGET}`);
  });

  it('boot упал из-за одновременного включения другим — снимает владение, не гасит', () => {
    const f = fixture();
    f.write('state/boot-race', '1');
    const r = f.run(`${boot}\n${release}\necho "owned:$booted_here"`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('owned:');
    expect(f.state()).toBe('Booted');
    expect(f.calls()).not.toContain(`xcrun simctl shutdown ${TARGET}`);
  });

  it('другая ошибка boot — красный с понятной строкой; cleanup пробует погасить своё', () => {
    const f = fixture();
    f.fault('boot', 1);
    const r = f.run(boot);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`не удалось включить симулятор ${TARGET}`);
    expect(f.calls()).toContain(`xcrun simctl shutdown ${TARGET}`);
    expect(f.calls()).not.toContain(`xcrun simctl bootstatus ${TARGET} -b`);
  });

  it('прерванный boot уже считается своим и гасится в cleanup; код сигнала сохранён', () => {
    const f = fixture();
    f.write('state/boot-interrupt', '1');
    const r = f.run(boot);
    expect(r.status).toBe(130);
    expect(f.state()).toBe('Shutdown');
    expect(f.calls()).toContain(`xcrun simctl shutdown ${TARGET}`);
  });

  it('ошибка bootstatus не теряет своё устройство для cleanup', () => {
    const f = fixture();
    f.fault('bootstatus', 1);
    const r = f.run(boot);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('не закончил загрузку');
    expect(f.state()).toBe('Shutdown');
  });

  it('своё гаснет в sim_release и больше не гасится в cleanup', () => {
    const f = fixture();
    const r = f.run(`${boot}\n${release}\necho "owned:$booted_here"`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('owned:');
    expect(f.state()).toBe('Shutdown');
    expect(f.calls().filter((call) => call === `xcrun simctl shutdown ${TARGET}`)).toHaveLength(1);
  });

  it('два своих устройства учитываются отдельно; release одного не теряет второе', () => {
    const f = fixture();
    const r = f.run(`${boot}\nsim_boot second-sim\n${release}\necho "owned:$booted_here"`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('owned: second-sim');
    expect(f.state()).toBe('Shutdown');
    expect(f.state('second-sim')).toBe('Shutdown');
    expect(f.calls().filter((call) => call.startsWith('xcrun simctl shutdown '))).toHaveLength(2);
  });

  it('shutdown упал — своё осталось в списке, cleanup гасит второй попыткой', () => {
    const f = fixture();
    f.fault('shutdown', 1);
    const r = f.run(`${boot}\nif ${release}; then exit 2; fi\necho "owned:$booted_here"`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain(`не удалось погасить симулятор ${TARGET}`);
    expect(r.stdout.trim()).toBe(`owned: ${TARGET}`);
    expect(f.state()).toBe('Shutdown');
    expect(f.calls().filter((call) => call === `xcrun simctl shutdown ${TARGET}`)).toHaveLength(2);
  });

  it('shutdown упал при выходе — красный с подсказкой ручного выключения', () => {
    const f = fixture();
    f.fault('shutdown');
    const r = f.run(boot);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`xcrun simctl shutdown ${TARGET}`);
    expect(f.state()).toBe('Booted');
  });

  it('неудачный release прерывает шаг, но настоящая ловушка гейта повторяет shutdown и удаляет временное', () => {
    const f = fixture();
    f.fault('shutdown', 1);
    f.write('state/work/marker', 'временное');
    const r = f.run(`${boot}\n${release}`);
    expect(r.status).toBe(1);
    expect(f.state()).toBe('Shutdown');
    expect(f.calls().filter((call) => call === `xcrun simctl shutdown ${TARGET}`)).toHaveLength(2);
    expect(fs.existsSync(path.join(f.dir, 'state/work'))).toBe(false);
  });

  it('ошибка cleanup одного своего не мешает погасить остальных', () => {
    const f = fixture();
    f.fault('shutdown', 1);
    const r = f.run(`${boot}\nsim_boot second-sim`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`xcrun simctl shutdown ${TARGET}`);
    expect(f.state()).toBe('Booted');
    expect(f.state('second-sim')).toBe('Shutdown');
  });

  it('успешный cleanup сохраняет красный код основного шага', () => {
    const f = fixture();
    const r = f.run(`${boot}\nexit 7`);
    expect(r.status).toBe(7);
    expect(f.state()).toBe('Shutdown');
  });

  it.each([0, 7])('артефакты CI переживают cleanup при коде %s; своё устройство гасится', (status) => {
    const f = fixture();
    f.write('state/work/iphone.xcresult/Info.plist', 'результат');
    f.write('state/work/snapshots/failed.png', 'снимок');
    const r = f.run(`${boot}\nexit ${status}`, true, {
      GATE_APPLE_ARTIFACTS_DIR: path.join(f.dir, 'state/work'),
    });
    expect(r.status, r.stderr).toBe(status);
    expect(f.state()).toBe('Shutdown');
    expect(fs.existsSync(path.join(f.dir, 'state/work/iphone.xcresult/Info.plist'))).toBe(true);
    expect(fs.existsSync(path.join(f.dir, 'state/work/snapshots/failed.png'))).toBe(true);
  });

  it('cleanup после неудачного release повторяет shutdown и остаётся красным, если своё не погасло', () => {
    const f = fixture();
    f.fault('shutdown');
    const r = f.run(`${boot}\n${release}`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`xcrun simctl shutdown ${TARGET}`);
    expect(f.calls().filter((call) => call === `xcrun simctl shutdown ${TARGET}`)).toHaveLength(2);
    expect(f.state()).toBe('Booted');
  });
});

describe('run-sim — общий предел без владения', { timeout: TEST_TIMEOUT_MS }, () => {
  it('ждёт место перед boot, оставляет своё включённым для человека', () => {
    const f = fixture();
    f.booted(5);
    f.onPoll('echo Shutdown >"$GP_TEST_STATE/sim-neighbor-0"');
    const r = f.runSim();
    expect(r.status, r.stderr).toBe(0);
    const calls = f.calls();
    expect(calls).toContain('sleep 10');
    expect(calls.indexOf(`xcrun simctl boot ${TARGET}`)).toBeGreaterThan(calls.indexOf('sleep 10'));
    expect(f.state()).toBe('Booted');
    expect(calls).not.toContain(`xcrun simctl shutdown ${TARGET}`);
  });

  it('после ожидания берёт включённый другим без повторного boot и shutdown', () => {
    const f = fixture();
    f.booted(5);
    f.onPoll(`echo Shutdown >"$GP_TEST_STATE/sim-neighbor-0"
echo Shutdown >"$GP_TEST_STATE/sim-neighbor-1"
echo Booted >"$GP_TEST_STATE/sim-${TARGET}"`);
    const r = f.runSim();
    expect(r.status, r.stderr).toBe(0);
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
    expect(f.calls()).not.toContain(`xcrun simctl shutdown ${TARGET}`);
    expect(f.state()).toBe('Booted');
  });

  it('при полной пятёрке и истечении срока ничего не включает', () => {
    const f = fixture();
    f.booted(5);
    const r = f.runSim();
    expect(r.status).toBe(1);
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
  });

  it('уже включённый берёт без ожидания при полной пятёрке', () => {
    const f = fixture();
    f.booted(4);
    f.write(`state/sim-${TARGET}`, 'Booted');
    const r = f.runSim();
    expect(r.status, r.stderr).toBe(0);
    expect(f.calls().filter((call) => call.startsWith('sleep '))).toEqual([]);
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
    expect(f.state()).toBe('Booted');
  });

  it.each(['list', 'adb'])('ошибка %s — ждёт, по сроку красный и не включает', (command) => {
    const f = fixture();
    f.fault(command);
    const r = f.runSim();
    expect(r.status).toBe(1);
    expect(f.calls().filter((call) => call === 'sleep 10')).toHaveLength(2);
    expect(f.calls()).not.toContain(`xcrun simctl boot ${TARGET}`);
  });

  it('stop гасит выбранное устройство без ожидания места', () => {
    const f = fixture();
    f.booted(4);
    f.write(`state/sim-${TARGET}`, 'Booted');
    const r = f.runSim(['stop', 'iphone']);
    expect(r.status, r.stderr).toBe(0);
    expect(f.state()).toBe('Shutdown');
    expect(f.calls()).toEqual([`xcrun simctl shutdown ${TARGET}`]);
  });
});
