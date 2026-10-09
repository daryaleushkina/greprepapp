import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './returnTo';

describe('адрес после входа', () => {
  it.each(['/', '/settings', '/step/words?source=plan#details', '/training/new?section=quant', '/step/%D1%88%D0%B0%D0%B3'])('свой путь %s сохраняется целиком', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    undefined, null, 17, {}, '', 'settings', 'https://evil.example/x', 'http:evil.example', 'javascript:alert(1)',
    '//evil.example', '///evil.example', '/x//evil', '\\evil.example', '/\\evil.example', '/x\\y',
    '/\n/evil.example', '/x\r', '/x\t', '/x\0', '/x\u007f', '/x\u0085',
    '/%2f%2fevil.example', '/%5cevil.example', '/%255cevil.example', '/x%0a', '/x%250d', '/x%00', '/x%7f', '/%', '/%252525252541',
    '/signin', '/signin?returnTo=/signin', '/auth/callback', '/step/../signin', '/%73ignin/',
  ])('неподходящий адрес %j — «Сегодня»', (path) => {
    expect(safeReturnTo(path)).toBe('/');
  });
});
