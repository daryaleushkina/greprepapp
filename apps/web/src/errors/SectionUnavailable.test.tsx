import { describe, expect, it, vi } from 'vitest';
import { fakeServer, json, renderApp, STARTER, user } from '../test/app';

const state = vi.hoisted(() => ({ unavailable: true }));
vi.mock('../sections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sections')>();
  return { ...actual, loadSections: async () => {
    if (state.unavailable) throw new actual.SectionLoadError(new TypeError('Failed to fetch dynamically imported module'));
    return actual.loadSections();
  } };
});

describe('недоступный пакет разделов', () => {
  it('незагруженный шаг по глубокой ссылке сохраняет полноэкранную оболочку', async () => {
    state.unavailable = true;
    fakeServer({ 'GET /api/me': () => json(user()) });
    const { screen } = await renderApp({ path: '/step/words' });
    await expect.element(screen.getByRole('heading', { name: 'Нет сети', exact: true })).toBeVisible();
    await expect.element(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Разделы' }).elements()).toHaveLength(0);
  });

  it('«Нет сети» оставляет вкладки и кэш; повтор догружает пакет', async () => {
    const { requests } = fakeServer({ 'GET /api/me': () => json(user()), 'GET /api/today': () => json(STARTER) });
    const { screen, router, queryClient } = await renderApp({ path: '/' });
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
    await screen.getByRole('link', { name: 'Прогресс', exact: true }).click();
    await expect.element(screen.getByRole('heading', { name: 'Нет сети', exact: true })).toBeVisible();
    expect(router.state.location.pathname).toBe('/progress');
    expect(queryClient.getQueryData(['/api/today'])).toEqual(STARTER);
    expect(requests.some((request) => request.url.endsWith('/api/client-errors'))).toBe(false);
    // Повтор доступен даже до появления сети; не меняет документ и не теряет живое приложение.
    await screen.getByRole('button', { name: 'Повторить' }).click();
    await expect.element(screen.getByRole('heading', { name: 'Нет сети', exact: true })).toBeVisible();
    state.unavailable = false;
    window.dispatchEvent(new Event('online'));
    await screen.getByRole('button', { name: 'Повторить' }).click();
    await expect.element(screen.getByText('Тренировок ещё не было')).toBeVisible();
    await screen.getByRole('link', { name: 'Сегодня', exact: true }).click();
    await expect.element(screen.getByText('Три шага · около 25 минут')).toBeVisible();
  });
});
