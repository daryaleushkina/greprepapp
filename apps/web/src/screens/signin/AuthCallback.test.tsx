import { describe, expect, it, vi } from 'vitest';
import { apiError, fakeServer, json, renderApp, STARTER, user } from '../../test/app';

/** Попытка, которую оставил бы beginSignIn перед уходом к провайдеру. */
function storeAttempt(state = 'state-1') {
  sessionStorage.setItem(
    'greprep.signIn',
    JSON.stringify({
      provider: 'telegram',
      state,
      nonce: 'nonce-0123456789abcdef',
      codeVerifier: 'v'.repeat(43),
      redirectUri: `${location.origin}/auth/callback`,
      startedAt: Date.now(),
    }),
  );
}

const signedOut = { 'GET /api/me': () => apiError(401, 'unauthorized') };

describe('возврат от провайдера', () => {
  it('код меняется на сессию на сервере (куки, PKCE, nonce, язык) — дальше «Сегодня»', async () => {
    storeAttempt();
    const { requests } = fakeServer({
      ...signedOut,
      'POST /api/auth/oidc/code': () => json({ expiresAt: '2026-11-05T10:00:00Z', user: user() }),
      'GET /api/today': () => json(STARTER),
    });
    const { screen, router } = await renderApp({ path: '/auth/callback?code=c-1&state=state-1' });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
    const body: unknown = await requests.find((r) => r.url.endsWith('/api/auth/oidc/code'))?.json();
    expect(body).toEqual({
      provider: 'telegram',
      code: 'c-1',
      codeVerifier: 'v'.repeat(43),
      redirectUri: `${location.origin}/auth/callback`,
      nonce: 'nonce-0123456789abcdef',
      transport: 'cookie',
      clientKind: 'web',
      locale: 'ru',
    });
    expect(sessionStorage.getItem('greprep.signIn')).toBeNull();
  });

  it('чужой state — на вход с «Не получилось», сервер не вызывается', async () => {
    storeAttempt();
    const { requests } = fakeServer(signedOut);
    const { screen, router } = await renderApp({ path: '/auth/callback?code=c-1&state=forged' });
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось войти. Попробуйте ещё раз.');
    expect(router.state.location.search).toEqual({ reason: 'failed' });
    expect(requests.some((r) => r.url.includes('/api/auth/oidc'))).toBe(false);
  });

  it('отмена у провайдера — «Вход отменён»', async () => {
    storeAttempt();
    fakeServer(signedOut);
    const { screen } = await renderApp({ path: '/auth/callback?error=access_denied&state=state-1' });
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Вход отменён — можно попробовать снова.');
  });

  it.each([
    [apiError(401, 'invalid_id_token'), 'Не получилось войти. Попробуйте ещё раз.'],
    [apiError(429, 'too_many_requests'), 'Слишком много попыток подряд — подождите минуту.'],
  ])('сервер отказал — причина на экране входа', async (response, text) => {
    storeAttempt();
    fakeServer({ ...signedOut, 'POST /api/auth/oidc/code': () => response });
    const { screen } = await renderApp({ path: '/auth/callback?code=c-1&state=state-1' });
    await expect.element(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('ответ на обмен кода не по договору — «Не получилось» и отчёт об ошибке', async () => {
    storeAttempt();
    const { requests } = fakeServer({
      ...signedOut,
      'POST /api/auth/oidc/code': () => json({ expiresAt: 'not-a-date', user: {} }),
      'POST /api/client-errors': () => new Response(null, { status: 204 }),
    });
    const { screen } = await renderApp({ path: '/auth/callback?code=c-1&state=state-1' });
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось войти. Попробуйте ещё раз.');
    await expect.poll(() => requests.some((r) => r.url.endsWith('/api/client-errors'))).toBe(true);
  });

  it('нет сети на обмене кода — «Нет сети»', async () => {
    storeAttempt();
    fakeServer({
      ...signedOut,
      'POST /api/auth/oidc/code': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { screen } = await renderApp({ path: '/auth/callback?code=c-1&state=state-1' });
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Нет сети — войти получится, когда она появится.');
  });
});

describe('хранилище вкладки запрещено настройками браузера', () => {
  it('возврат не падает, а ведёт на вход с «Не получилось»', async () => {
    fakeServer(signedOut);
    const denied = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const { screen, router } = await renderApp({ path: '/auth/callback?code=c-1&state=state-1' });
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось войти. Попробуйте ещё раз.');
    expect(router.state.location.search).toEqual({ reason: 'failed' });
    denied.mockRestore();
  });
});

describe('гонка с запросом «кто вошёл»', () => {
  it('поздний ответ /api/me «не вошёл» не затирает только что открытую сессию', async () => {
    storeAttempt();
    // /api/me ушёл при открытии страницы возврата (куки ещё нет) и отвечает уже после обмена кода.
    let releaseMe: () => void = () => {};
    const meAnswered = new Promise<void>((r) => (releaseMe = r));
    let meReturned = false;
    fakeServer({
      'GET /api/me': async () => {
        await meAnswered;
        meReturned = true;
        return apiError(401, 'unauthorized');
      },
      'POST /api/auth/oidc/code': () => {
        setTimeout(releaseMe, 50);
        return json({ expiresAt: '2026-11-05T10:00:00Z', user: user() });
      },
      'GET /api/today': () => json(STARTER),
    });
    const { screen, router } = await renderApp({ path: '/auth/callback?code=c-1&state=state-1' });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    // Ответ /api/me пришёл (и обработан, пока экран «Сегодня») — сессия осталась.
    await expect.poll(() => meReturned).toBe(true);
    await expect.poll(() => router.state.location.pathname).toBe('/');
    expect(router.state.location.pathname).toBe('/');
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
  });
});
