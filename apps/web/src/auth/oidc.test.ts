import { describe, expect, it } from 'vitest';
import { beginSignIn, CALLBACK_PATH, finishSignIn, type AttemptStorage } from './oidc';
import { codeChallenge, randomToken } from './pkce';

function memoryStorage(): AttemptStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const config = { authorizationEndpoint: 'https://oauth.example/auth?prompt=consent', clientId: 'client-1' };

describe('pkce', () => {
  it('случайная строка — 43 знака base64url', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('S256 по RFC 7636, приложение B', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('beginSignIn', () => {
  it('адрес провайдера: код, PKCE, state, nonce, свои параметры провайдера сохранены', async () => {
    const storage = memoryStorage();
    const url = new URL(await beginSignIn('telegram', config, 'https://site.example', storage, 1000));
    const attempt = JSON.parse(storage.data.values().next().value ?? '{}');
    expect(url.origin + url.pathname).toBe('https://oauth.example/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      prompt: 'consent',
      response_type: 'code',
      client_id: 'client-1',
      redirect_uri: `https://site.example${CALLBACK_PATH}`,
      scope: 'openid profile',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: await codeChallenge(attempt.codeVerifier),
      code_challenge_method: 'S256',
    });
    expect(attempt).toMatchObject({ provider: 'telegram', startedAt: 1000, redirectUri: `https://site.example${CALLBACK_PATH}` });
  });

  it('Apple на сайте — без scope: с name/email он требует form_post', async () => {
    const url = new URL(await beginSignIn('apple', config, 'https://site.example', memoryStorage()));
    expect(url.searchParams.has('scope')).toBe(false);
  });
});

describe('finishSignIn', () => {
  async function started() {
    const storage = memoryStorage();
    const url = new URL(await beginSignIn('google', config, 'https://site.example', storage, 1000));
    return { storage, state: url.searchParams.get('state') ?? '' };
  }

  it('код и свой state — вход; попытка одноразовая', async () => {
    const { storage, state } = await started();
    const res = finishSignIn(new URLSearchParams({ code: 'c1', state }), storage, 2000);
    expect(res.ok && res.code).toBe('c1');
    expect(res.ok && res.attempt.provider).toBe('google');
    expect(finishSignIn(new URLSearchParams({ code: 'c1', state }), storage, 2000)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('чужой state — отказ', async () => {
    const { storage } = await started();
    expect(finishSignIn(new URLSearchParams({ code: 'c1', state: 'forged' }), storage, 2000)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('отмена у провайдера и другая ошибка', async () => {
    const a = await started();
    expect(finishSignIn(new URLSearchParams({ error: 'access_denied', state: a.state }), a.storage, 2000)).toEqual({ ok: false, reason: 'cancelled', returnTo: '/' });
    const b = await started();
    expect(finishSignIn(new URLSearchParams({ error: 'server_error', state: b.state }), b.storage, 2000)).toEqual({ ok: false, reason: 'invalid', returnTo: '/' });
  });

  it('без кода, устаревшая попытка, испорченная запись', async () => {
    const a = await started();
    expect(finishSignIn(new URLSearchParams({ state: a.state }), a.storage, 2000)).toEqual({ ok: false, reason: 'invalid' });
    const b = await started();
    expect(finishSignIn(new URLSearchParams({ code: 'c', state: b.state }), b.storage, 1000 + 11 * 60 * 1000)).toEqual({ ok: false, reason: 'invalid' });
    const broken = memoryStorage();
    broken.setItem('greprep.signIn', '{not json');
    expect(finishSignIn(new URLSearchParams({ code: 'c', state: 's' }), broken)).toEqual({ ok: false, reason: 'invalid' });
    broken.setItem('greprep.signIn', JSON.stringify({ provider: 'yandex', state: 's' }));
    expect(finishSignIn(new URLSearchParams({ code: 'c', state: 's' }), broken)).toEqual({ ok: false, reason: 'invalid' });
    expect(finishSignIn(new URLSearchParams({ code: 'c', state: 's' }), memoryStorage())).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each(['/settings?from=plan#details', '//evil.example', '/%255cevil.example'])('попытка сохраняет безопасный адрес %s и перепроверяет его при возврате', async (path) => {
    const storage = memoryStorage();
    const url = new URL(await beginSignIn('google', config, 'https://site.example', storage, 1000, path));
    const raw: unknown = JSON.parse(storage.getItem('greprep.signIn') ?? '{}');
    expect(raw).toMatchObject({ returnTo: path.startsWith('/settings') ? path : '/' });
    storage.setItem('greprep.signIn', JSON.stringify({ ...(typeof raw === 'object' && raw), returnTo: path }));
    const result = finishSignIn(new URLSearchParams({ code: 'c', state: url.searchParams.get('state') ?? '' }), storage, 2000);
    expect(result.ok && result.attempt.returnTo).toBe(path.startsWith('/settings') ? path : '/');
  });
});
