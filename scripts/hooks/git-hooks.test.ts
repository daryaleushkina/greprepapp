// git-хуки commit-msg (автор — Даша, без подписей ИИ) и pre-push (гейт на уходящем коммите; без каркаса — пропуск)
// — во временном репозитории.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HOOKS = path.dirname(fileURLToPath(import.meta.url));
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function repo(email = 't@example.com') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-git-hooks-'));
  const git = (...args: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', `user.email=${email}`, ...args], { cwd: dir, encoding: 'utf8', env: ENV });
  git('init', '-q', '-b', 'main');
  git('config', 'core.hooksPath', HOOKS);
  const write = (file: string, text = 'x') => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  return { dir, git, write };
}

describe('commit-msg', () => {
  // Автор передаётся так же, как его передаёт хуку git commit, — иначе хук возьмёт глобальный конфиг машины
  // (в облаке это «Claude») и тест будет зависеть от того, где его запустили.
  const check = (message: string, email = 't@example.com') => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gp-msg-')), 'MSG');
    fs.writeFileSync(file, message);
    return spawnSync(path.join(HOOKS, 'commit-msg'), [file], {
      encoding: 'utf8',
      env: { ...ENV, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: email },
    });
  };

  it.each([
    'Задания: разбор ответа\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
    'Fix\n\nco-authored-by: Someone <noreply@anthropic.com>',
    'Fix\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    'Fix\n\nClaude-Session: https://claude.ai/code/session_1',
    'Fix\n\nсм. claude.ai/code',
  ])('отклоняет подпись: %s', (message) => {
    const r = check(message);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('подпись ИИ-ассистента');
    expect(r.stderr).toMatch(/^ {2}\d+: /m);
  });

  it.each([
    'Задания: разбор ответа по @username',
    'Fix\n\nCo-Authored-By: Darya <darya@example.com>',
    'Сгенерировано скриптом\n\nGenerated with pnpm bot:setup',
    // Комментарии git и всё ниже «ножниц» в коммит не попадают.
    'Fix\n# Co-Authored-By: Claude <noreply@anthropic.com>',
    'Fix\n# ------------------------ >8 ------------------------\n+Co-Authored-By: Claude <noreply@anthropic.com>',
  ])('пропускает: %s', (message) => {
    expect(check(message).status).toBe(0);
  });

  it('автор Claude — отклоняет даже чистое сообщение', () => {
    const r = check('Задания: разбор ответа', 'noreply@anthropic.com');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('автор коммита — Claude');
  });

  it('нет файла сообщения — не мешает', () => {
    expect(spawnSync(path.join(HOOKS, 'commit-msg'), ['/nonexistent/MSG']).status).toBe(0);
  });
});

describe('git commit с хуками проекта', () => {
  it('обычный коммит проходит', () => {
    const { git, write } = repo();
    write('src/a.ts');
    git('add', '.');
    const r = git('commit', '-q', '-m', 'Обычная правка');
    expect(r.status, r.stderr).toBe(0);
  });

  it('подпись ИИ в сообщении — коммит отклонён', () => {
    const { git, write } = repo();
    write('src/a.ts');
    git('add', '.');
    const r = git('commit', '-q', '-m', 'Правка\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('подпись ИИ-ассистента');
  });

  it('автор Claude — коммит отклонён с подсказкой, как поставить Дашу', () => {
    const { git, write } = repo('noreply@anthropic.com');
    write('src/a.ts');
    git('add', '.');
    const r = git('commit', '-q', '-m', 'Обычная правка');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('автор коммита — Claude');
    expect(r.stderr).toContain('git config user.name daryaleushkina');
  });

  it('.claude/skills и .mcp.json коммитятся: скиллы правятся по просьбе Даши, запрета нет', () => {
    const { git, write } = repo();
    write('.claude/skills/x/SKILL.md');
    write('.mcp.json');
    git('add', '.');
    const r = git('commit', '-q', '-m', 'Скиллы');
    expect(r.status, r.stderr).toBe(0);
  });
});

describe('pre-push', () => {
  const push = (dir: string, sha: string) =>
    spawnSync(path.join(HOOKS, 'pre-push'), ['origin', 'x'], {
      cwd: dir,
      encoding: 'utf8',
      env: ENV,
      input: `refs/heads/main ${sha} refs/heads/main 0000000000000000000000000000000000000000\n`,
    });

  it('без каркаса (ни server/go.mod, ни package.json) — гейт проверять нечего, пуш в main проходит', () => {
    const { dir, git, write } = repo();
    write('README.md');
    git('add', '.');
    git('commit', '-q', '-m', 'Начало');
    const r = push(dir, git('rev-parse', 'HEAD').stdout.trim());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('каркаса нет');
  });

  it('в main уходит не текущий HEAD — отказ: гейт проверил бы другой коммит', () => {
    const { dir, git, write } = repo();
    write('a.txt');
    git('add', '.');
    git('commit', '-q', '-m', 'Первый');
    const first = git('rev-parse', 'HEAD').stdout.trim();
    write('b.txt');
    git('add', '.');
    git('commit', '-q', '-m', 'Второй');
    const r = push(dir, first);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('не текущий HEAD');
  });

  it('незакоммиченные изменения — отказ: в гейт попало бы не то, что в коммите', () => {
    const { dir, git, write } = repo();
    write('a.txt');
    git('add', '.');
    git('commit', '-q', '-m', 'Первый');
    write('a.txt', 'changed');
    const r = push(dir, git('rev-parse', 'HEAD').stdout.trim());
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('незакоммиченные изменения');
  });

  it('пуш не в main — молча пропускает', () => {
    const { dir } = repo();
    const r = spawnSync(path.join(HOOKS, 'pre-push'), ['origin', 'x'], {
      cwd: dir,
      encoding: 'utf8',
      env: ENV,
      input: 'refs/heads/feature abc refs/heads/feature 0000000000000000000000000000000000000000\n',
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });
});

describe('apple-touched — нужна ли в гейте часть Apple', () => {
  const touched = (dir: string, ...base: string[]) =>
    spawnSync('sh', [path.join(HOOKS, 'apple-touched'), ...base], { cwd: dir, encoding: 'utf8', env: ENV }).status;

  // База — то, что уже лежит в main на GitHub; дальше — коммит, который уходит.
  const history = (file: string) => {
    const { dir, git, write } = repo();
    write('apps/apple/project.yml');
    write('docs/HANDOFF.md');
    git('add', '.');
    git('commit', '-q', '-m', 'База');
    const base = git('rev-parse', 'HEAD').stdout.trim();
    write(file, 'новое');
    git('add', '.');
    git('commit', '-q', '-m', 'Правка');
    return { dir, git, base };
  };

  it('пуш только с документами — часть Apple можно пропустить', () => {
    const { dir, base } = history('docs/HANDOFF.md');
    expect(touched(dir, base)).toBe(1);
  });

  it.each(['apps/apple/GrePrep/App.swift', 'api/openapi.yaml', 'design/tokens/src/x.json', 'server/main.go', 'scripts/hooks/gate', 'compose.yaml'])(
    'задет %s — проверять',
    (file) => {
      const { dir, base } = history(file);
      expect(touched(dir, base)).toBe(0);
    },
  );

  it('нет базы, нулевая или незнакомая база — проверять всё', () => {
    const { dir } = history('docs/HANDOFF.md');
    expect(touched(dir)).toBe(0);
    expect(touched(dir, '0000000000000000000000000000000000000000')).toBe(0);
    expect(touched(dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(0);
  });

  it('pre-push с одними документами — гейт пропускает часть Apple и говорит об этом', () => {
    const { dir, git, base } = history('docs/HANDOFF.md');
    const head = git('rev-parse', 'HEAD').stdout.trim();
    const r = spawnSync(path.join(HOOKS, 'pre-push'), ['origin', 'x'], {
      cwd: dir,
      encoding: 'utf8',
      env: ENV,
      input: `refs/heads/main ${head} refs/heads/main ${base}\n`,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('Apple — пропущен');
  });
});
