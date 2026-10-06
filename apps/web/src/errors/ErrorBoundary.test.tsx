import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { fakeServer } from '../test/app';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('render failed');
}

describe('ErrorBoundary', () => {
  it('падение экрана — отчёт со стеком компонентов и «Обновить» вместо белого листа', async () => {
    // React сам пишет пойманную ошибку в консоль — в выводе тестов она лишняя.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { requests } = fakeServer({ 'POST /api/client-errors': () => new Response(null, { status: 204 }) });
    const screen = await render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    await expect.element(screen.getByText('Что-то пошло не так')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Обновить' })).toBeVisible();
    await expect.poll(() => requests.some((r) => r.url.endsWith('/api/client-errors'))).toBe(true);
    const body: unknown = await requests.find((r) => r.url.endsWith('/api/client-errors'))?.json();
    expect(body).toMatchObject({ message: 'Error: render failed', stack: expect.stringContaining('component stack') });
  });
});
