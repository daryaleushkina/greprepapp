import { describe, expect, it } from 'vitest';
import { clientKind, detectShell } from './shell';

describe('detectShell', () => {
  it.each([
    ['/tg', 'telegram'],
    ['/tg/', 'telegram'],
    ['/tg/step/words', 'telegram'],
    ['/', 'site'],
    ['/signin', 'site'],
    ['/tgx', 'site'],
    ['/auth/callback', 'site'],
  ] as const)('%s → %s', (path, want) => {
    expect(detectShell(path)).toBe(want);
  });

  it('вид клиента для сервера', () => {
    expect(clientKind('telegram')).toBe('telegram');
    expect(clientKind('site')).toBe('web');
  });
});
