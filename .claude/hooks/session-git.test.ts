// Настройки автора проверяются в отдельном репозитории и с отдельным глобальным конфигом:
// тест не должен менять ни автора Дарьи на Маке, ни конфиг рабочего дерева.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HOOK = fileURLToPath(new URL('./session-git.sh', import.meta.url));
const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function session(name?: string, email?: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-session-git-'));
  temporary.push(dir);
  const global = path.join(dir, 'global.gitconfig');
  fs.writeFileSync(global, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1', CLAUDE_PROJECT_DIR: dir };
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  git('init', '-q');
  if (name !== undefined) git('config', '--global', 'user.name', name);
  if (email !== undefined) git('config', '--global', 'user.email', email);
  const run = () => {
    const result = spawnSync('sh', [HOOK], { cwd: os.tmpdir(), env, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return result;
  };
  return { dir, global, git, run };
}

describe('session-git — автор сессии', () => {
  it.each([
    ['Claude', 'noreply@anthropic.com'],
    ['Cloud worker', 'noreply@anthropic.com'],
    ['Claude', 'worker@example.com'],
    [undefined, undefined],
  ])('в облаке (%s, %s) ставит Дашу только в локальный конфиг', (name, email) => {
    const { global, git, run } = session(name, email);
    const before = fs.readFileSync(global, 'utf8');
    run();
    expect(git('config', '--local', 'user.name')).toBe('Darya Leushkina');
    expect(git('config', '--local', 'user.email')).toBe('15678175+daryaleushkina@users.noreply.github.com');
    expect(fs.readFileSync(global, 'utf8')).toBe(before);
  });

  it('на Маке сохраняет своего глобального автора и не пишет локальные настройки', () => {
    const { dir, global, git, run } = session('Darya Leushkina', '15678175+daryaleushkina@users.noreply.github.com');
    const config = path.join(dir, '.git/config');
    const before = fs.readFileSync(config, 'utf8');
    const globalBefore = fs.readFileSync(global, 'utf8');
    run();
    expect(git('config', 'user.name')).toBe('Darya Leushkina');
    expect(git('config', 'user.email')).toBe('15678175+daryaleushkina@users.noreply.github.com');
    expect(fs.readFileSync(config, 'utf8')).toBe(before);
    expect(fs.readFileSync(global, 'utf8')).toBe(globalBefore);
  });

  it('сохраняет локального автора, заданного на Маке', () => {
    const { dir, git, run } = session('Claude', 'noreply@anthropic.com');
    git('config', '--local', 'user.name', 'Darya Leushkina');
    git('config', '--local', 'user.email', '15678175+daryaleushkina@users.noreply.github.com');
    const config = path.join(dir, '.git/config');
    const before = fs.readFileSync(config, 'utf8');
    run();
    expect(fs.readFileSync(config, 'utf8')).toBe(before);
  });

  it('повторный запуск не меняет уже настроенного автора', () => {
    const { dir, run } = session('Claude', 'noreply@anthropic.com');
    run();
    const config = path.join(dir, '.git/config');
    const before = fs.readFileSync(config, 'utf8');
    run();
    expect(fs.readFileSync(config, 'utf8')).toBe(before);
  });
});
