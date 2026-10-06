import { describe, expect, it } from 'vitest';
import { apiError, fakeServer, json, renderApp, STARTER, user } from '../../test/app';

const signedIn = { 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) };
const launch = { initDataRaw: 'query_id=1&hash=x', languageCode: 'ru' };

describe('настройки', () => {
  it('сайт: «Выйти» — сессия удалена на сервере, дальше вход; версия сборки видна', async () => {
    const { requests } = fakeServer({ ...signedIn, 'POST /api/auth/logout': () => new Response(null, { status: 204 }) });
    const { screen, router } = await renderApp({ path: '/settings' });
    await expect.element(screen.getByText(/^Версия /)).toBeVisible();
    await screen.getByRole('button', { name: 'Выйти' }).click();
    await expect.element(screen.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/signin');
    expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/api/auth/logout'))).toBe(true);
  });

  it('сессия уже кончилась (вышли в другой вкладке) — «Выйти» всё равно выходит и стирает данные', async () => {
    const { requests } = fakeServer({ ...signedIn, 'POST /api/auth/logout': () => apiError(401, 'unauthorized') });
    // Сначала «Сегодня»: план человека оказывается в кэше, потом — настройки.
    const { screen, router, queryClient } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    expect(queryClient.getQueryData(['/api/today'])).toBeDefined();
    await router.navigate({ to: '/settings' });
    await screen.getByRole('button', { name: 'Выйти' }).click();
    await expect.element(screen.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/signin');
    expect(queryClient.getQueryData(['/api/today'])).toBeUndefined();
    expect(requests.some((r) => r.url.endsWith('/api/auth/logout'))).toBe(true);
  });

  it.each([
    [() => apiError(500, 'internal'), 'Не получилось выйти. Попробуйте ещё раз.'],
    [
      () => {
        throw new TypeError('Failed to fetch');
      },
      'Нет сети — выйти получится, когда она появится.',
    ],
  ])('выйти не вышло — экран как был и причина', async (logout, text) => {
    fakeServer({ ...signedIn, 'POST /api/auth/logout': logout });
    const { screen, router } = await renderApp({ path: '/settings' });
    await screen.getByRole('button', { name: 'Выйти' }).click();
    await expect.element(screen.getByRole('alert')).toHaveTextContent(text);
    expect(router.state.location.pathname).toBe('/settings');
    await expect.element(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled();
  });

  it('мини-апп: выхода нет — вход здесь сам Telegram', async () => {
    fakeServer({ 'POST /api/auth/telegram-mini-app': () => json({ token: 't', expiresAt: '2026-11-05T10:00:00Z', user: user() }) });
    const { screen } = await renderApp({ path: '/tg/settings', shell: 'telegram', launch });
    await expect.element(screen.getByRole('heading', { name: 'Настройки' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Выйти' }).elements()).toHaveLength(0);
  });
});

describe('мини-апп: вход по initData', () => {
  it('initData уходит на сервер, токен — в заголовке следующих запросов', async () => {
    const { requests } = fakeServer({
      'POST /api/auth/telegram-mini-app': () => json({ token: 'tok-1', expiresAt: '2026-11-05T10:00:00Z', user: user() }),
      'GET /api/today': () => json(STARTER),
    });
    const { screen } = await renderApp({ path: '/tg/', shell: 'telegram', launch });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    const signIn: unknown = await requests.find((r) => r.url.endsWith('/api/auth/telegram-mini-app'))?.json();
    expect(signIn).toEqual({ initData: 'query_id=1&hash=x' });
    expect(requests.find((r) => r.url.endsWith('/api/today'))?.headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('сервер отклонил initData — «Не получилось войти» и «Повторить»', async () => {
    let reject = true;
    fakeServer({
      'POST /api/auth/telegram-mini-app': () => (reject ? apiError(401, 'invalid_init_data') : json({ token: 't', expiresAt: '2026-11-05T10:00:00Z', user: user() })),
      'GET /api/today': () => json(STARTER),
    });
    const { screen } = await renderApp({ path: '/tg/', shell: 'telegram', launch });
    await expect.element(screen.getByRole('heading', { name: 'Не получилось войти' })).toBeVisible();
    reject = false;
    await screen.getByRole('button', { name: 'Повторить' }).click();
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
  });

  it('сессия кончилась посреди работы — мини-апп входит заново сам', async () => {
    let todayCalls = 0;
    let signIns = 0;
    fakeServer({
      'POST /api/auth/telegram-mini-app': () => {
        signIns++;
        return json({ token: `tok-${signIns}`, expiresAt: '2026-11-05T10:00:00Z', user: user() });
      },
      'GET /api/today': () => (++todayCalls === 1 ? apiError(401, 'unauthorized') : json(STARTER)),
    });
    const { screen } = await renderApp({ path: '/tg/', shell: 'telegram', launch });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    expect(signIns).toBe(2);
  });

  it('вход заново не удался — упавшие запросы не перечитываются без токена, экран говорит, что не вошли', async () => {
    let signIns = 0;
    let todayCalls = 0;
    fakeServer({
      'POST /api/auth/telegram-mini-app': () =>
        ++signIns === 1 ? json({ token: 'tok-1', expiresAt: '2026-11-05T10:00:00Z', user: user() }) : apiError(401, 'invalid_init_data'),
      'GET /api/today': () => {
        todayCalls++;
        return apiError(401, 'unauthorized');
      },
    });
    const { screen } = await renderApp({ path: '/tg/', shell: 'telegram', launch });
    await expect.element(screen.getByRole('heading', { name: 'Не получилось войти' })).toBeVisible();
    expect(signIns).toBe(2);
    expect(todayCalls).toBe(1);
  });

  it('язык Telegram — английский: пока идёт вход, экран загрузки по-английски; дальше — язык аккаунта', async () => {
    let finishSignIn: () => void = () => {};
    const signedInLater = new Promise<void>((r) => (finishSignIn = r));
    fakeServer({
      'POST /api/auth/telegram-mini-app': async () => {
        await signedInLater;
        return json({ token: 't', expiresAt: '2026-11-05T10:00:00Z', user: user({ locale: 'ru' }) });
      },
      'GET /api/today': () => json(STARTER),
    });
    const { screen } = await renderApp({ path: '/tg/', shell: 'telegram', launch: { ...launch, languageCode: 'en' } });
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect.element(screen.getByText('Loading today’s plan')).toBeInTheDocument();
    finishSignIn();
    // Аккаунт — русский: после входа интерфейс на языке аккаунта.
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeVisible();
  });

  it.each([
    [() => apiError(429, 'too_many_requests'), 'Слишком много попыток подряд — подождите минуту.'],
    [
      () => {
        throw new TypeError('Failed to fetch');
      },
      'Нет сети — войти получится, когда она появится.',
    ],
  ])('вход мини-аппа не прошёл — причина на экране', async (reply, text) => {
    fakeServer({ 'POST /api/auth/telegram-mini-app': reply });
    const { screen } = await renderApp({ path: '/tg/', shell: 'telegram', launch });
    await expect.element(screen.getByText(text)).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Повторить' })).toBeVisible();
  });

  it('ответ входа без токена — ошибка договора: «Не получилось войти» и отчёт', async () => {
    const { requests } = fakeServer({
      'POST /api/auth/telegram-mini-app': () => json({ expiresAt: '2026-11-05T10:00:00Z', user: user() }),
      'POST /api/client-errors': () => new Response(null, { status: 204 }),
    });
    const { screen } = await renderApp({ path: '/tg/', shell: 'telegram', launch });
    await expect.element(screen.getByRole('heading', { name: 'Не получилось войти' })).toBeVisible();
    await expect.poll(() => requests.some((r) => r.url.endsWith('/api/client-errors'))).toBe(true);
  });
});
