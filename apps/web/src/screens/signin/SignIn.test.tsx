import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, fakeServer, json, renderApp, STARTER, user } from '../../test/app';

const leaveTo = vi.hoisted(() => vi.fn((_url: string) => {}));
vi.mock('../../leave', () => ({ leaveTo }));
beforeEach(() => leaveTo.mockClear());

const signedOut = { 'GET /api/me': () => apiError(401, 'unauthorized') };

describe('вход на сайте', () => {
  it('глубокая ссылка сохраняется на входе и возвращается после входа подменой', async () => {
    fakeServer({
      ...signedOut,
      'POST /api/auth/dev': () => json({ expiresAt: '2026-11-05T10:00:00Z', user: user() }),
      'GET /api/today': () => json(STARTER),
    });
    const { screen, router } = await renderApp({ path: '/step/words?source=plan#details' });
    await expect.element(screen.getByPlaceholder('Имя тестового пользователя')).toBeVisible();
    expect(router.state.location.search).toMatchObject({ returnTo: '/step/words?source=plan#details' });
    await screen.getByPlaceholder('Имя тестового пользователя').fill('Тест');
    await screen.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect.element(screen.getByText('Шаг words')).toBeVisible();
    expect(router.state.location.href).toBe('/step/words?source=plan#details');
  });

  it('без сессии — на вход: три официальные кнопки, условия и дисклеймер ETS', async () => {
    fakeServer(signedOut);
    const { screen, router } = await renderApp({ path: '/' });
    await expect.element(screen.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/signin');
    await expect.element(screen.getByRole('button', { name: 'Вход с Apple' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Войти с аккаунтом Google' })).toBeVisible();
    await expect.element(screen.getByText(/registered trademark of Educational Testing Service/)).toBeVisible();
  });

  it.each([
    ['Войти через Telegram', 'Вход через Telegram ещё не подключён — он появится до беты.'],
    ['Вход с Apple', 'Вход с Apple ещё не подключён — он появится до беты.'],
    ['Войти с аккаунтом Google', 'Вход через Google ещё не подключён — он появится до беты.'],
  ])('провайдер без аккаунта: «%s» честно говорит, что не подключён', async (button, message) => {
    fakeServer(signedOut);
    const { screen } = await renderApp({ path: '/signin' });
    await screen.getByRole('button', { name: button }).click();
    await expect.element(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('вход подменой: кука от сервера, язык устройства — в запросе, дальше «Сегодня»', async () => {
    const { requests } = fakeServer({
      ...signedOut,
      'POST /api/auth/dev': () => json({ expiresAt: '2026-11-05T10:00:00Z', user: user({ name: 'Тест' }) }),
      'GET /api/today': () => json(STARTER),
    });
    const { screen, router } = await renderApp({ path: '/signin' });
    await screen.getByPlaceholder('Имя тестового пользователя').fill('Тест');
    await screen.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
    const body: unknown = await requests.find((r) => r.url.endsWith('/api/auth/dev'))?.json();
    expect(body).toEqual({ name: 'Тест', transport: 'cookie', clientKind: 'web', locale: 'ru' });
  });

  it('вход подменой не прошёл — причина, экран как был', async () => {
    fakeServer({ ...signedOut, 'POST /api/auth/dev': () => apiError(404, 'not_found') });
    const { screen } = await renderApp({ path: '/signin' });
    await screen.getByPlaceholder('Имя тестового пользователя').fill('Тест');
    await screen.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Не получилось войти. Попробуйте ещё раз.');
  });

  it.each([
    ['expired', 'Вход закончился — войдите снова.'],
    ['cancelled', 'Вход отменён — можно попробовать снова.'],
    ['offline', 'Нет сети — войти получится, когда она появится.'],
    ['tooMany', 'Слишком много попыток подряд — подождите минуту.'],
  ])('причина в адресе ?reason=%s', async (reason, text) => {
    fakeServer(signedOut);
    const { screen } = await renderApp({ path: `/signin?reason=${reason}` });
    await expect.element(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('неизвестная причина в адресе — без сообщения', async () => {
    fakeServer(signedOut);
    const { screen } = await renderApp({ path: '/signin?reason=<script>' });
    await expect.element(screen.getByRole('button', { name: 'Войти через Telegram' })).toBeVisible();
    expect(screen.getByRole('alert').elements()).toHaveLength(0);
  });

  it('уже вошёл — с экрана входа сразу на «Сегодня»', async () => {
    fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) });
    const { screen, router } = await renderApp({ path: '/signin' });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
  });

  it('язык аккаунта запоминается: после выхода вход — на нём, а не на языке браузера', async () => {
    fakeServer({
      'GET /api/me': () => json(user({ locale: 'en' })),
      'GET /api/today': () => json(STARTER),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    const { screen } = await renderApp({ path: '/settings' });
    await screen.getByRole('button', { name: 'Sign out' }).click();
    await expect.element(screen.getByRole('button', { name: 'Log in with Telegram' })).toBeVisible();
  });
});

describe('вход через провайдера', () => {
  it.each([
    ['Войти через Telegram', 'TELEGRAM', 'tg-client', 'openid profile'],
    ['Вход с Apple', 'APPLE', 'apple-services-id', null],
    ['Войти с аккаунтом Google', 'GOOGLE', 'google-client', 'openid profile'],
  ])('«%s» уводит на страницу провайдера с PKCE и адресом возврата', async (button, env, clientId, scope) => {
    vi.stubEnv(`VITE_OIDC_${env}_AUTHORIZATION_ENDPOINT`, 'https://oauth.example/authorize');
    vi.stubEnv(`VITE_OIDC_${env}_CLIENT_ID`, clientId);
    fakeServer(signedOut);
    const { screen } = await renderApp({ path: '/signin' });
    await screen.getByRole('button', { name: button }).click();
    await expect.poll(() => leaveTo.mock.calls.length).toBe(1);
    const url = new URL(String(leaveTo.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://oauth.example/authorize');
    expect(url.searchParams.get('client_id')).toBe(clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(`${location.origin}/auth/callback`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe(scope);
    expect(sessionStorage.getItem('greprep.signIn')).toContain(url.searchParams.get('state'));
    // Пока уходим — кнопки заняты: второй уход не начнётся.
    await expect.element(screen.getByRole('button', { name: button })).toBeDisabled();
  });

  it('вернулись «назад» со страницы провайдера (страница из кэша браузера) — кнопки снова доступны', async () => {
    vi.stubEnv('VITE_OIDC_APPLE_AUTHORIZATION_ENDPOINT', 'https://oauth.example/authorize');
    vi.stubEnv('VITE_OIDC_APPLE_CLIENT_ID', 'apple-services-id');
    fakeServer(signedOut);
    const { screen } = await renderApp({ path: '/signin' });
    await screen.getByRole('button', { name: 'Вход с Apple' }).click();
    await expect.element(screen.getByRole('button', { name: 'Вход с Apple' })).toBeDisabled();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await expect.element(screen.getByRole('button', { name: 'Вход с Apple' })).toBeEnabled();
  });
});
