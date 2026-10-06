import { describe, expect, it, vi } from 'vitest';
import { fakeServer, json, renderApp, STARTER, user } from '../test/app';

// Экран, который падает при отрисовке, — внутри маршрутизатора (у него свой перехват ошибок).
vi.mock('../screens/progress/ProgressScreen', () => ({
  ProgressScreen: () => {
    throw new Error('progress exploded');
  },
}));

describe('падение экрана внутри маршрутов', () => {
  it('наш экран «Что-то пошло не так» и отчёт на сервер, а не заглушка маршрутизатора', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { requests } = fakeServer({
      'GET /api/me': () => json(user()),
      'GET /api/today': () => json(STARTER),
      'POST /api/client-errors': () => new Response(null, { status: 204 }),
    });
    const { screen } = await renderApp({ path: '/progress' });
    await expect.element(screen.getByText('Что-то пошло не так')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Обновить' })).toBeVisible();
    await expect.poll(() => requests.some((r) => r.url.endsWith('/api/client-errors'))).toBe(true);
    const body: unknown = await requests.find((r) => r.url.endsWith('/api/client-errors'))?.json();
    expect(body).toMatchObject({ message: 'Error: progress exploded', route: expect.any(String) });
    quiet.mockRestore();
  });
});
